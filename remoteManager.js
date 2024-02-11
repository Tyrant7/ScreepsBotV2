const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const overlay = require("overlay");

class RemoteManager {

    constructor() {
        this.remotePlans = {};
    }

    run(roomInfo, remoteSpawnHandler, remainingSpawnCapacity) {
        

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

        // Let's process each remote, we'll queue spawns for each one
        remoteSpawnHandler.clearQueues();
        plans.forEach((remote) => {
            const neededSpawns = this.processRemote(roomInfo, remote);
            for (const role in neededSpawns) {
                if (neededSpawns[role] > 0) {
                    remoteSpawnHandler.queueSpawn(roomInfo.room.name, role, neededSpawns[role]);
                }
            }
        });

        /*
        console.log("-----------------");
        remoteSpawnHandler.spawnQueues[roomInfo.room.name].forEach((c) => {
            console.log(Object.values(c));
        })
        */

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
                const pathFixed = path.path.map((point) => {
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
        // Let's track all unbuilt structures for this remote
        const unbuilt = [];

        // Containers first
        const room = Game.rooms[remoteInfo.room];
        if (room) {
            remoteInfo.containers.forEach((container) => {
                const containerSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, container.x, container.y).find((s) => s.structureType === STRUCTURE_CONTAINER);
                const existingContainer = room.lookForAt(LOOK_STRUCTURES, container.x, container.y).find((s) => s.structureType === STRUCTURE_CONTAINER);
                if (!containerSite && !existingContainer) {
                    // console.log("Unbuilt container at: " + container);
                    unbuilt.push({ pos: container, type: STRUCTURE_CONTAINER });
                }
            });
        }

        // Then roads
        remoteInfo.roads.forEach((road) => {
            const room = Game.rooms[road.roomName];
            if (room) {
                const roadSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, road.x, road.y).find((s) => s.structureType === STRUCTURE_ROAD);
                const existingRoad = room.lookForAt(LOOK_STRUCTURES, road.x, road.y).find((s) => s.structureType === STRUCTURE_ROAD);
                if (!roadSite && !existingRoad) {
                    unbuilt.push({ pos: road, type: STRUCTURE_ROAD });
                }
            }
        });

        // Handle some relevant things in this remote, and track needed spawns
        const neededSpawns = {};
        neededSpawns[CONSTANTS.roles.remoteBuilder] = this.handleConstruction(roomInfo, remoteInfo, unbuilt);
        neededSpawns[CONSTANTS.roles.remoteMiner] = this.handleMiners(roomInfo, remoteInfo);
        neededSpawns[CONSTANTS.roles.reserver] = this.handleReservers(roomInfo, remoteInfo);
        neededSpawns[CONSTANTS.roles.remoteHauler] = this.handleHaulers(roomInfo, remoteInfo);
        return neededSpawns;
    }

    
    /**
     * Handles requesting builders and placing sites in this remote if needed.
     * @param {RoomInfo} roomInfo The info object associated with the home room of this remote.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {number} The number of builders wanted by this room.
     */
    handleConstruction(roomInfo, remoteInfo, unbuiltStructures) {

        // Handle builders for this remote if we have things left to build
        const builders = roomInfo.remoteBuilders.filter((builder) => builder.memory.targetRoom === remoteInfo.room);
        if (unbuiltStructures.length) {
            
            // Allocate builders
            const wantedBuilderCount = this.handleBuilderCount(roomInfo, remoteInfo, builders);

            // Manage sites
            const sites = this.handleSites(roomInfo, remoteInfo, builders, unbuiltStructures);

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

        // If there's nothing left to build in this room, let's just request one builder to handle repairs
        return Math.max(1 - builders.length, 0);
    }

    /**
     * Handles allocating more builders to this remote if under the ideal amount.
     * @param {RoomInfo} roomInfo The info object for the home room to pull builders from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {number} The number of workers needed in this remote.
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
        return (wantedBuilderCount - builders.length) * CONSTANTS.maxRemoteBuilderLevel;
    }

    /**
     * Handles the appropriate placing of construction sites for the target remote.
     * @param {RoomInfo} roomInfo The info object for the home room of the remote.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @param {Creep[]} builders An array of builders assigned to this remote.
     * @returns An array of the current construction sites in the remote after new placement.
     */
    handleSites(roomInfo, remoteInfo, builders, unbuilt) {

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

            /*
            unbuilt.forEach((p) => {
                console.log(Object.values(p));
            });
            */

            // Start with containers
            const currentSites = room.find(FIND_CONSTRUCTION_SITES);
            let placed = 0;
            while (currentSites.length + placed <= builders.length + 1 
                && unbuilt.length > 0 
                && unbuilt[0].type === STRUCTURE_CONTAINER) { 

                const next = unbuilt.pop();
                next.pos.createConstructionSite(next.type);
                placed++;
            }

            // No need to attempt placing roads
            if (currentSites.length + placed > builders.length + 1) {
                return currentSites;
            }

            // Let's place the wanted site currently closest to an arbirary source
            const source = room.find(FIND_SOURCES)[0];
            unbuilt.sort((a, b) => {
                return source.pos.getRangeTo(b.pos) - source.pos.getRangeTo(a.pos);
            });

            while (currentSites.length + placed <= builders.length + 1 && unbuilt.length > 0) {
                const next = unbuilt.pop();
                if (Game.rooms[next.pos.roomName]) {
                    next.pos.createConstructionSite(next.type);
                    placed++;
                }
            }
            return currentSites;
        }
        return null;
    }

    /**
     * Handles requesting a reserver for this remote if one does not yet exist.
     * @param {RoomInfo} roomInfo The info object for the home room to pull miners from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {number} The number of reservers this remote currently needs.
     */
    handleReservers(roomInfo, remoteInfo) {

        // Make sure there isn't a reserver already assigned to this room
        const reserver = roomInfo.reservers.find((reserver) => reserver.memory.targetRoom === remoteInfo.room);
        if (reserver) {
            return 0;
        }

        // Find an unused reserver
        const unassignedReserver = roomInfo.reservers.find((reserver) => !reserver.memory.targetRoom);
        if (unassignedReserver) {
            unassignedReserver.memory.targetRoom = remoteInfo.room;
            return 0;
        }
        return 1;
    }

    /**
     * Handles requesting miners for this room.
     * @param {RoomInfo} roomInfo The info object for the home room to pull miners from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @returns {number} The number of miners needed in this remote.
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
        return unassignedSources.length;
    }

    /**
     * Handles requesting haulers for this room.
     * @param {RoomInfo} roomInfo The home room to request haulers from.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     */
    handleHaulers(roomInfo, remoteInfo) {

        // We'll operate on a per-source basis
        let totalMissingCarry = 0;
        remoteInfo.haulerPaths.forEach((path) => {

            // Figure out how much CARRY we're missing per path
            const haulers = roomInfo.remoteHaulers.filter((h) => {
                return h.memory.container &&
                       h.memory.container.x === path.container.x &&
                       h.memory.container.y === path.container.y &&
                       h.memory.container.roomName === path.container.roomName;
            });
            const currentCarry = haulers.reduce((totalCarry, curr) => totalCarry + curr.body.filter((p) => p.type === CARRY).length, 0);       
            let missingCarry = path.neededCarry - currentCarry;

            // If we have extra, and we can safely reallocate a hauler, let's do so
            if (missingCarry < 0 && haulers.length > 1) {
                // First, let's find the smallest hauler
                const smallestHauler = haulers.reduce((smallest, curr) => {
                    const currentCarry = curr.body.filter((p) => p.type === CARRY).length;
                    return !smallest || currentCarry < smallest.carry 
                        ? { carry: currentCarry, creep: curr }
                        : smallest;
                });

                // Then let's check if reallocating it keeps us above our threshold
                if (missingCarry + smallestHauler.carry <= 0) {
                    // If yes, reallocate it
                    delete smallestHauler.creep.memory.container;
                    missingCarry += smallestHauler.carry;
                }
            }
            // If we're missing CARRY, let's look unassigned haulers
            else if (missingCarry > 0) {

                // Track unassigned haulers
                const unassignedHaulers = roomInfo.remoteHaulers.filter((h) => !h.memory.container);

                // Limit to assigning one new hauler per tick so they correctly rearrange themselves when a new one spawns
                if (unassignedHaulers.length > 0) {

                    // While we can assign more haulers, let's pick the best unassigned one for this job
                    const bestCandidate = 
                    unassignedHaulers.length > 1 ?
                        unassignedHaulers.reduce((best, curr) => {
                            
                            const currentCarry = curr.body.filter((p) => p.type === CARRY).length;

                            // We're going to define "best" as most closely matching our ideal carry count
                            return !best || Math.abs(currentCarry - missingCarry) < Math.abs(best.carry - missingCarry)
                                ? { carry: currentCarry, creep: curr }
                                : best;
                        }) 
                    : { 
                        carry: unassignedHaulers[0].body.filter((p) => p.type === CARRY).length,
                        creep: unassignedHaulers[0] 
                    };

                    // Assign our best candidate
                    bestCandidate.creep.memory.container = path.container;
                    missingCarry -= bestCandidate.carry;
                }
            }

            // Even include negatives since overspawned haulers should redistribute naturally
            totalMissingCarry += missingCarry;
        });
        return totalMissingCarry;
    }
}

module.exports = RemoteManager;