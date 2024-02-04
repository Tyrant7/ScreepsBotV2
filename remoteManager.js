const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const overlay = require("overlay");

class RemoteManager {

    constructor() {
        this.remotePlans = {};
    }

    run(roomInfo, remainingSpawnCapacity) {
        

        // Responsiblity list:
        //
        // 1. Planning remotes
        // -> remote planner module will handle this part
        //
        // 2. Tracking remote efficiency and printing out an overlay in the base room
        // -> printing remote name, gross energy production, net energy production, 
        //    upkeep, spawn cost, and current creep vs ideal creep counts
        //
        // 3. Tracking states for each remote
        // -> constructing: remote is in progress of being built
        //    - requesting builders
        //    - handling placement of construction sites in an efficient order
        //    - ensuring that only one remote per base room is being constructed at a time for efficiency
        //    - handling switching the state when remote is built enough to be efficient
        // -> active: remote is healthy and producing
        //    - handling maintenance if roads become too low or destroyed
        //    - requesting additional haulers if containers overflow
        //    - handle searching for threats in this remote or nearby
        // -> contested: remote is under potential threat
        //    - requesting defenders
        //    - handling of setting certain flags for present miners and haulers to be aware 
        //      and react appropriately by fleeing
        //    - if contest goes on for too long or cost is too great abandon the remote
        // -> abandoned: remote has been captured by an enemy or discarded due to lack of efficiency
        //    - track reason for abandonement
        //    - should handle flagging the room as dangerous and keeping track of the threat if that was the cause
        //    - should also calculate if best course of action is to retake the room or to 
        //      attempt to build a new remote somewhere else once threat has subsided for other rooms


        // Plan our remotes, if we haven't already
        const roomName = roomInfo.room.name;
        let reload = !this.remotePlans[roomName];
        if (reload) {
            const unsortedPlans = this.getRemotePlans(roomInfo, remainingSpawnCapacity);

            // Sort plans by distance, then efficiency score to allow creeps to be assigned under a natural priority 
            // of more important (i.e. higher scoring and closer) remotes
            this.remotePlans[roomName] = unsortedPlans.sort((a, b) => {
                const aScore = (a.children.length ? 100000 : 0) + a.score;
                const bScore = (b.children.length ? 100000 : 0) + b.score;
                return bScore - aScore;
            });
        }
        const plans = this.remotePlans[roomName];

        if (!Memory.bases[roomName]) {
            Memory.bases[roomName] = {};
        }

        if (!Memory.bases[roomName].remotes || reload) {
            Memory.bases[roomName].remotes = [];
            plans.forEach((remote) => Memory.bases[roomName].remotes.push({ 
                room: remote.room,
            }));
        }

        // Let's process each remote
        const neededSpawns = {};
        plans.forEach((remote) => {
            const remoteSpawns = this.processRemote(roomInfo, remote);

            // Sum up the needed spawns of each role for all remotes
            for (const role in remoteSpawns) {
                if (!neededSpawns[role]) {
                    neededSpawns[role] = { current: 0, ideal: 0 };
                }
                neededSpawns[role].current += remoteSpawns[role].current;
                neededSpawns[role].ideal += remoteSpawns[role].ideal;
            }
        });

        // Let's track this spawn need now so that our SpawnHandler can read from it later
        if (!Memory.bases[roomName].remoteSpawns) {
            Memory.bases[roomName].remoteSpawns = {};
        }
        for (const role in neededSpawns) {
            Memory.bases[roomName].remoteSpawns[role] = neededSpawns[role];
        }

        // Overlays
        this.drawOverlays();
    }

    getRemotePlans(roomInfo, remainingSpawnCapacity) {

        const cpu = Game.cpu.getUsed();

        // Here's out best combination of remotes and the order they have to be built in
        // Keep in mind that distance 1's are interchangable, so we can use a greedy algorithm 
        // to easily pull the most efficient one
        const bestBranch = remotePlanner.planRemotes(roomInfo, remainingSpawnCapacity);
        if (!bestBranch) {
            return;
        }

        // Track road postions for debugging
        if (DEBUG.drawOverlay) {
            if (DEBUG.drawRoadOverlay) {
                const allRoads = bestBranch.reduce((roads, node) => roads.concat(node.roads), []);     
                this.roadVisuals = allRoads;
            }
            if (DEBUG.drawPathOverlay) {
                const allHaulerPaths = [];
                bestBranch.forEach((node) => allHaulerPaths.push(...node.haulerPaths));
                this.haulerPaths = allHaulerPaths;
            }
            if (DEBUG.drawContainerOverlay) {
                const allContainerPositions = bestBranch.reduce((containers, node) => containers.concat(node.containers), []);
                this.containerPositions = allContainerPositions;
            }
        }

        // CPU tracking
        if (DEBUG.trackCPUUsage) {
            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            bestBranch.forEach((b) => console.log("Room " + b.room + " with score: " + b.score + " and cost: " + b.cost));
            const totalCost = bestBranch.reduce((usage, node) => usage + node.cost, 0);
            console.log("Total spawn usage after remotes: " + (CONSTANTS.maxBaseSpawnCapacity - remainingSpawnCapacity + totalCost));
        }

        return bestBranch;
    }

    drawOverlays() {
        if (DEBUG.drawRoadOverlay && this.roadVisuals) {
            overlay.circles(this.roadVisuals);
        }
        if (DEBUG.drawPathOverlay && this.haulerPaths) {
            const colours = [
                "#FF0000",
                "#00FF00",
                "#0000FF",
            ];

            let i = 0;
            this.haulerPaths.forEach((path) => {
                const pathFixed = path.map((point) => {
                    return { x: point.x, y: point.y, roomName: point.roomName };
                });
                overlay.circles(pathFixed, { fill: colours[i % colours.length], radius: 0.25, opacity: 0.3 });
                i++;
            });
        }
        if (DEBUG.drawContainerOverlay && this.containerPositions) {
            overlay.rects(this.containerPositions);
        }
    }

    processRemote(roomInfo, remoteInfo) {

        // Let's remove all roads that have already been built or have a construction site from this plan
        remoteInfo.roads = remoteInfo.roads.filter((road) => {
            const room = Game.rooms[road.roomName];
            if (!room) {
                return true;
            }
            const roadSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, road.x, road.y);
            const roads = room.lookForAt(LOOK_STRUCTURES, road.x, road.y, { filter: { structureType: STRUCTURE_ROAD } });
            return roadSites.length === 0 && roads.length === 0;
        });

        // Same thing with containers -> can only be built inside the remote room 
        // whereas roads can be built anywhere along the route
        const room = Game.rooms[remoteInfo.room];
        if (room) {
            remoteInfo.containers = remoteInfo.containers.filter((container) => {
                const containerSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, container.x, container.y);
                const containers = room.lookForAt(LOOK_STRUCTURES, container.x, container.y, { filter: { structureType: STRUCTURE_CONTAINER } });
                return containerSites.length === 0 && containers.length === 0;
            });
        }

        // Handle some relevant things in this remote, and track needed spawns
        const neededSpawns = {};
        neededSpawns.builders = this.handleConstruction(roomInfo, remoteInfo);
        neededSpawns.reservers = this.handleReservers(roomInfo, remoteInfo);
        neededSpawns.miners = this.handleMiners(roomInfo, remoteInfo);
        return neededSpawns;
    }

    
    /**
     * Handles requesting builders and placing sites in this remote if needed.
     * @param {RoomInfo} roomInfo The info object associated with the home room of this remote.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {number} The number of builders wanted by this room.
     */
    handleConstruction(roomInfo, remoteInfo) {

        // Handle builders for this remote if we have things left to build
        const room = Game.rooms[remoteInfo.room];
        const builders = roomInfo.remoteBuilders.filter((builder) => builder.memory.targetRoom === remoteInfo.room);
        if ((room && room.find(FIND_CONSTRUCTION_SITES).length > 0) ||
            remoteInfo.roads.length) {

            // Allocate builders
            const wantedBuilderCount = this.handleBuilderCount(roomInfo, remoteInfo, builders);

            // Manage sites
            const sites = this.handleSites(roomInfo, remoteInfo, builders);

            // Must have vision in the room
            if (builders && sites) {
                // When we have fewer things left to build than the number of builders assigned to this room, 
                // even after creating more sites, it means that there is nothing left to build and we can mark the extra builders for reassignment
                while (sites.length < builders.length) {
                    const extra = builders.pop();
                    delete extra.memory.targetRoom;
                }
            }
            return wantedBuilderCount;
        }

        // If we can't see the room, let's just decide based on whether or not we have enough 
        // builders to build the remaining planned roads or not
        return (remoteInfo.roads.length > builders.length) ? 1 : 0;
    }

    /**
     * Handles allocating more builders to this remote if under the ideal amount.
     * @param {RoomInfo} roomInfo The info object for the home room to pull builders from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {{}}} An object containing the number of builders still needed by this remote, and the total amount of builders this remote needs.
     */
    handleBuilderCount(roomInfo, remoteInfo, builders) {

        // Request a builder while we have fewer than the number of sources in this room
        const unassignedBuilders = roomInfo.remoteBuilders.filter((builder) => !builder.memory.targetRoom);
        const wantedBuilderCount = Math.max(Memory.rooms[remoteInfo.room].sources.length, 0);
        while (wantedBuilderCount > builders.length && unassignedBuilders.length > 0) {
            const unassigned = unassignedBuilders.pop();
            if (unassigned) {
                unassigned.memory.targetRoom = remoteInfo.room;
                builders.push(unassigned);
            }
        }
        return { ideal: wantedBuilderCount, current: builders.length };
    }

    /**
     * Handles the appropriate placing of construction sites for the target remote.
     * @param {RoomInfo} roomInfo The info object for the home room of the remote.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @param {Creep[]} builders An array of builders assigned to this remote.
     * @returns An array of the current construction sites in the remote after new placement.
     */
    handleSites(roomInfo, remoteInfo, builders) {

        // Let's take a simple approach to making sure the inside our main room are built by simply placing all of them
        // Our aggressive base building allocation should take care of this quite easily
        remoteInfo.roads.forEach((pos) => {
            if (pos.roomName === roomInfo.room.name) {
                const sitePos = new RoomPosition(pos.x, pos.y, pos.roomName);
                sitePos.createConstructionSite(STRUCTURE_ROAD);
            }
        });

        // We should ideally keep nBuilders + 1 sites active at a time
        const room = Game.rooms[remoteInfo.room];
        if (room) {

            // Start with containers
            const currentSites = room.find(FIND_CONSTRUCTION_SITES);
            let placed = 0;
            if (remoteInfo.containers.length > currentSites) {
                const next = remoteInfo.containers.pop();
                next.createConstructionSite(STRUCTURE_CONTAINER);
                placed++;
            }

            // No need to event attempt placing roads
            if (currentSites.length + placed > builders.length + 1) {
                return currentSites;
            }

            // Let's place the wanted site currently closest to an arbirary source
            const source = room.find(FIND_SOURCES)[0];
            remoteInfo.roads.sort((a, b) => {
                return source.pos.getRangeTo(b) - source.pos.getRangeTo(a);
            });

            while (currentSites.length + placed <= builders.length + 1 && remoteInfo.roads.length > 0) {
                const next = remoteInfo.roads.pop();
                next.createConstructionSite(STRUCTURE_ROAD);
                placed++;
            }
            return currentSites;
        }
        return null;
    }

    /**
     * Handles requesting a claimer for this remote if one does not yet exist.
     * @param {RoomInfo} roomInfo The info object for the home room to pull miners from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {{}}} An object containing the number of claimers still needed by this remote, and the total amount of claimers this remote needs.
     */
    handleReservers(roomInfo, remoteInfo) {

        // Make sure there isn't a claimer already assigned to this room
        const claimer = roomInfo.claimers.find((claimer) => claimer.memory.controllerID === remoteInfo.controller.id);
        if (claimer) {
            return;
        }

        // Find an unused claimer
        const unassignedClaimer = roomInfo.claimers.find((claimer) => !claimer.memory.controllerID);
        if (unassignedClaimer) {
            unassignedClaimer.memory.controllerID = roomInfo.controller.id;
            return { ideal: 1, current: 1 };
        }
        return { ideal: 1, current: 0 };
    }

    /**
     * Handles requesting miners for this room.
     * @param {RoomInfo} roomInfo The info object for the home room to pull miners from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {{}}} An object containing the number of miners still needed by this remote, and the total amount of miners this remote needs.
     */
    handleMiners(roomInfo, remoteInfo) {

        // Find all unassigned sources in this room
        const sources = Memory.rooms[remoteInfo.room].sources;
        const unassignedSources = sources.filter((source) => {
            return !roomInfo.remoteMiners.find((miner) => miner.memory.sourceID === source.id); 
        });
        // And all unassigned miners
        const unassignedMiners = roomInfo.remoteMiners.filter((miner) => !miner.memory.sourceID);

        // Pair them while unassigned of both exist
        while (unassignedSources.length > 0 && unassignedMiners.length > 0) {
            const miner = unassignedMiners.pop();
            const source = unassignedSources.pop();
            if (miner && source) {
                miner.memory.sourceID = source.id;
                miner.memory.targetRoom = remoteInfo.room;
            }
        }
        return { ideal: sources.length, current: sources.length - unassignedSources.length };
    }

    handleHaulers(roomInfo, remoteInfo) {


    }
}

module.exports = RemoteManager;