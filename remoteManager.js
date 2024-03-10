const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const utility = require("remoteUtility");

const overlay = require("overlay");
const profiler = require("profiler");

class RemoteManager {

    run(roomInfo, baseRoomSpawnCost) {
        
        // Get our plans
        const remotePlans = this.ensurePlansExist(roomInfo, baseRoomSpawnCost);
        if (!remotePlans) {
            return 0;
        }

        // Process each planned remote, cutting off when the spawns go above our threshold
        let spawnCosts = 0;
        let passedThreshold = false;
        for (const remoteRoom in remotePlans) {
            const remote = remotePlans[remoteRoom];

            // Once we hit our cutoff, mark all remaining remotes as inactive
            if (passedThreshold || spawnCosts + remote.cost + baseRoomSpawnCost >= 1) {
                passedThreshold = true;
                remote.active = false;
                continue;
            }

            // Mark this remote as active and process it
            remote.active = true;
            spawnCosts += remote.cost;
            this.processRemote(roomInfo, remote);
        }

        // Display our active remotes
        if (DEBUG.trackSpawnUsage) {
            const remoteDisplay = {};
            Object.keys(remotePlans).forEach((remoteRoom) => {
                remoteDisplay[remoteRoom] = remotePlans[remoteRoom].active 
                    ? "active (" + (Math.round(remotePlans[remoteRoom].cost * 1000) / 1000).toFixed(3) + ")" 
                    : "inactive";
            });
            overlay.addText(roomInfo.room.name, remoteDisplay);
        }

        // Overlays
        this.drawOverlays();

        // For tracking
        return spawnCosts;
    }

    /**
     * Plan our remotes, if we haven't already.
     * @param {RoomInfo} roomInfo Info object for the room to plan remotes for.
     * @param {number} baseRoomSpawnCost Spawn capacity for that room.
     * @returns The active plans for remotes for this room.
     */
    ensurePlansExist(roomInfo, baseRoomSpawnCost) {
        if (!utility.getRemotePlans(roomInfo.room.name) || (RELOAD && DEBUG.replanRemotesOnReload)) {
            const unsortedPlans = this.planRemotes(roomInfo, baseRoomSpawnCost);

            // Sort plans by distance, then efficiency score to allow creeps to be assigned under a natural priority 
            // of more important (i.e. higher scoring and closer) remotes
            const sortedPlans = unsortedPlans.sort((a, b) => {
                const aScore = (a.children.length ? 100000 : 0) + a.score;
                const bScore = (b.children.length ? 100000 : 0) + b.score;
                return bScore - aScore;
            });

            // Simplify the plan objects and map the roomName as a key
            const finalPlans = {};
            for (const plan of sortedPlans) {
                const roomName = plan.room;
                delete plan.room;
                delete plan.children;
                finalPlans[roomName] = plan;
            }
            utility.setRemotePlans(roomInfo.room.name, finalPlans);
        }
        return utility.getRemotePlans(roomInfo.room.name);
    }

    planRemotes(roomInfo, baseRoomSpawnCost) {

        const cpu = Game.cpu.getUsed();

        // Here's best combination of remotes and the order they have to be built in
        // Keep in mind that distance 1's are interchangable, so we can use a greedy algorithm 
        // to easily pull the most efficient one
        const bestBranch = remotePlanner.planRemotes(roomInfo);
        if (!bestBranch) {
            return;
        }

        // Track road postions for debugging
        if (DEBUG.drawOverlay) {
            if (DEBUG.drawRoadOverlay) {
                const allRoads = bestBranch.reduce((roads, node) => roads.concat(node.roads), []);     
                Memory.temp.roadVisuals = allRoads;
            }
            if (DEBUG.drawPathOverlay) {
                const allHaulerPaths = [];
                bestBranch.forEach((node) => allHaulerPaths.push(...node.haulerPaths));
                Memory.temp.haulerPaths = allHaulerPaths;
            }
            if (DEBUG.drawContainerOverlay) {
                const allContainerPositions = bestBranch.reduce((containers, node) => containers.concat(node.miningSites.map((site) => site.pos)), []);
                Memory.temp.containerPositions = allContainerPositions;
            }
        }

        // CPU tracking
        if (DEBUG.logRemotePlanning) {
            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            bestBranch.forEach((b) => console.log("Room " + b.room + " with score: " + b.score + " and cost: " + b.cost));
            const totalCost = bestBranch.reduce((usage, node) => usage + node.cost, 0);
            console.log("Total spawn usage after remotes: " + (baseRoomSpawnCost + totalCost));
        }

        return bestBranch;
    }

    drawOverlays() {
        if (DEBUG.drawRoadOverlay && Memory.temp.roadVisuals) {
            overlay.circles(Memory.temp.roadVisuals);
        }
        if (DEBUG.drawPathOverlay && Memory.temp.haulerPaths) {
            const colours = [
                "#FF0000",
                "#00FF00",
                "#0000FF",
            ];

            let i = 0;
            Memory.temp.haulerPaths.forEach((path) => {
                const pathFixed = path.path.map((point) => {
                    return { x: point.x, y: point.y, roomName: point.roomName };
                });
                overlay.circles(pathFixed, { fill: colours[i % colours.length], radius: 0.25, opacity: 0.3 });
                i++;
            });
        }
        if (DEBUG.drawContainerOverlay && Memory.temp.containerPositions) {
            overlay.rects(Memory.temp.containerPositions);
        }
    }

    processRemote(roomInfo, remoteInfo) {

        // Let's remove all roads that have already been built or have a construction site from this plan
        // Let's track all unbuilt structures for this remote
        const unbuilt = [];

        // Start with containers so that they're built first
        profiler.startSample("Structures " + remoteInfo.room);
        profiler.startSample("Containers " + remoteInfo.room);
        const room = Game.rooms[remoteInfo.room];
        if (room) {
            remoteInfo.miningSites.forEach((miningSite) => {
                const container = miningSite.pos;
                const containerSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, container.x, container.y).find((s) => s.structureType === STRUCTURE_CONTAINER);
                const existingContainer = room.lookForAt(LOOK_STRUCTURES, container.x, container.y).find((s) => s.structureType === STRUCTURE_CONTAINER);
                if (!containerSite && !existingContainer) {
                    unbuilt.push({ pos: container, type: STRUCTURE_CONTAINER });
                }
            });
        }
        profiler.endSample("Containers " + remoteInfo.room);

        // Then roads
        profiler.startSample("Roads " + remoteInfo.room);
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
        profiler.endSample("Roads " + remoteInfo.room); 
        profiler.endSample("Structures " + remoteInfo.room);

        // Handle placing construction sites for this remote
        profiler.startSample("Construction " + remoteInfo.room);
        const builders = roomInfo.workers.filter((worker) => worker.pos.roomName === remoteInfo.room);
        if (unbuilt.length) { 
            this.handleSites(roomInfo, remoteInfo, builders, unbuilt);
        }
        profiler.endSample("Construction " + remoteInfo.room);
    }

    
    /**
     * Handles the appropriate placing of construction sites for the target remote.
     * @param {RoomInfo} roomInfo The info object for the home room of the remote.
     * @param {{}} remoteInfo An object containing relevant info about the remote.
     * @param {Creep[]} builders An array of builders assigned to this remote.
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

            // Start with containers
            profiler.startSample("Container Sites " + remoteInfo.room);
            let siteCount = 0;
            while (unbuilt.length > 0 
                && unbuilt[0].type === STRUCTURE_CONTAINER) { 

                const next = unbuilt.shift();
                next.pos.createConstructionSite(next.type);
                siteCount++;
            }
            profiler.endSample("Container Sites " + remoteInfo.room);

            // No need to attempt placing roads
            siteCount += room.find(FIND_CONSTRUCTION_SITES).length;
            if (siteCount > builders.length + 1) {
                return;
            }

            // Let's place the wanted site currently closest to an arbirary source
            profiler.startSample("Road Sites " + remoteInfo.room);
            const source = room.find(FIND_SOURCES)[0];
            unbuilt.sort((a, b) => {
                return source.pos.getRangeTo(b.pos) - source.pos.getRangeTo(a.pos);
            });

            while (siteCount <= builders.length + 1 && unbuilt.length > 0) {
                const next = unbuilt.shift();
                if (Game.rooms[next.pos.roomName]) {
                    next.pos.createConstructionSite(next.type);
                    siteCount++;
                }
                else {
                    unbuilt.push(next);
                }
            }
            profiler.endSample("Road Sites " + remoteInfo.room);
        }
    }
}

module.exports = RemoteManager;