const RemoteSpawnHandler = require("remoteSpawnHandler");
const remoteSpawnHandler = new RemoteSpawnHandler();

class RemotePlanner {

    /**
     * Scores a potential remote for this room.
     * @param {RoomInfo} roomInfo The info object associated with the host room.
     * @param {string} targetName The name of the room to score a remote for. Must have been scouted previously.
     * @returns An object with scoring information for this remotes. 
     * Contains a `score` property for energy output and a `cost` property for spawn time.
     */
    scoreRemote(roomInfo, targetName) {

        // Ensure that we have information on the target room
        const remoteInfo = Memory.rooms[targetName];
        if (!remoteInfo.lastVisit) {
            return;
        }

        // Make sure it's a valid remote
        if (!remoteInfo.isValidRemote(targetName)) {
            return;
        }

        // Let's get the necessary pathing info for this remote
        const remotePaths = this.getRemotePaths(roomInfo, targetName);
        if (!remotePaths) {
            return;
        }

        // Let's calculate some upkeep costs using those newly created paths
        const upkeep = {};

        // Starting with containers, first
        const containerUpkeep = CONTAINER_DECAY / CONTAINER_DECAY_TIME / REPAIR_POWER;
        const totalContainerUpkeep = containerUpkeep * remoteInfo.sources.length;
        
        // Then roads, for this we can combine all paths and remove duplicate path positions
        const roadUpkeep = ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME / REPAIR_POWER;
        const allPaths = remotePaths.controllerPath.concat(...remotePaths.sourcesPaths);
        const allRoads = allPaths.sort((a, b) => a.x + a.y + a.roomName > b.x + b.y + b.roomName ? a : b).filter(function(item, pos, arr) {
            return !pos || item.isEqualTo(arr[pos - 1]);
        });
        const totalRoadUpkeep = roadUpkeep * allRoads.length;

        // Total energy upkeep for structures in this room
        upkeep.structures = totalContainerUpkeep + totalRoadUpkeep;

        // Now for creeps spawn costs, total up energy and spawn time upkeeps
        upkeep.creeps = remoteSpawnHandler.getUpkeepCosts(roomInfo, remoteInfo, remotePaths);

        // Calculate net energy produced in this room
        const grossEnergy = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME * remoteInfo.sources.length;
        const netEnergy = grossEnergy - (upkeep.structures + upkeep.creeps.energy);
        if (netEnergy <= 0) {
            return;
        }

        // Here's the score and cost of this remote so we can calculate which are most important
        return {
            score: netEnergy,
            cost: upkeep.creeps.spawnTime,
        };
    }

    /**
     * Determines if this room is a valid remote.
     * @param {string} roomName The name of the room to check.
     * @returns True or false depending on the presence of sources, invaders, players, and other factors.
     */
    isValidRemote(roomName) {
        const remoteInfo = Memory.rooms[targetName];

        // Owned by another player
        if (remoteInfo.controller.owner) {
            return false;
        }

        // No sources
        if (!remoteInfo.sources || !remoteInfo.sources.length) {
            return false;
        }

        // Too dangerous
        if ((remoteInfo.sourceKeepers && remoteInfo.sourceKeepers.length) || 
            (remoteInfo.keeperLairs && remoteInfo.keeperLairs.length)) {
            return false;
        }

        // Stronghold
        if (remoteInfo.invaderCores && remoteInfo.invaderCores.length) {
            return false;
        }
        return true;
    }

    /**
     * Draws paths between a remote's sources and controllers and the nearest road in its host room.
     * @param {RoomInfo} roomInfo The info object associated with the host room.
     * @param {string} targetName The name of the room to remote.
     * @returns An object with 2 properties: 
     * - `controllerPath`: an array of RoomPosition objects between the controller and nearest road in the host room.
     * - `sourcesPaths`: an array of arrays of RoomPositions between each source and the nearest road in the host room.
     * Each element corresponds to a unique path.
     */
    getRemotePaths(roomInfo, targetName) {
        const remoteInfo = Memory.rooms[targetName];

        // Make our cost matrix, setting structures as unwalkable,
        // We don't have to worry about roads since those are our targets
        const costMatrix = new PathFinder.CostMatrix();
        roomInfo.find(FIND_STRUCTURES).forEach(function(s) {
            if (s.structureType !== STRUCTURE_CONTAINER &&
                (s.structureType !== STRUCTURE_RAMPART || !s.my)) {
                costMatrix.set(s.pos.x, s.pos.y, 255);
            }
        });
        function getCostMatrix(roomName) {
            if (roomName === roomInfo.room.name) {
                return costMatrix;
            }
            // Since we can't actually see into the room we're planning for, we'll have to
            // trust that there aren't any structures blocking our path
            // TODO //
            // Have scouts track structures as well and use those when drawing our path
            return new PathFinder.CostMatrix;
        }

        // Let's get a path from the remote's controller to the closest existing road in the dependant room
        const controllerPos = new RoomPosition(remoteInfo.controller.pos.x, remoteInfo.controller.pos.y, targetName);
        const goals = roomInfo.find(FIND_STRUCTURES, { filter: STRUCTURE_ROAD }).map((road) => road.pos);
        const controllerResult = PathFinder.search(controllerPos, goals, {
            roomCallback: getCostMatrix,
        });

        // We need a full path for the rest of the steps
        if (controllerResult.incomplete) {
            return;
        }

        // Next, let's do the same thing but for the remote's sources
        const sourceResults = [];
        remoteInfo.sourcePositions.forEach(pos => {
            const sourcePos = new RoomPosition(pos.x, pos.y, targetName);
            sourceResults.push(PathFinder.search(sourcePos, goals, {
                roomCallback: getCostMatrix,
            }));
        });

        // Same thing for sources
        for (const result of sourceResults) {
            if (result.incomplete) {
                return;
            }
        }

        return {
            controllerPath: controllerResult.path,
            sourcesPaths: sourceResults.map((r) => r.path),
        };
    }


    createRemote() {

    }
}

module.exports = RemotePlanner;