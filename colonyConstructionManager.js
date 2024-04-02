class ColonyConstructionManager {
    
    run(roomInfo) {
        this.placeUpgraderContainer(roomInfo);
        roomInfo.sources.forEach((source) => {
            this.placeMinerContainer(source);
        });
        if (roomInfo.mineral) {
            this.placeMineralContainer(roomInfo.mineral);
        }
    }

    placeUpgraderContainer(roomInfo) {
        // Check if we have one already
        const base = Memory.bases[roomInfo.room.name];
        if (!base) {
            return;
        }
        let pos = base.upgraderContainer;
        if (!pos) {
            // Generate a placement position
            // By looking for the most accessible position within range 3 of the controller

            // Get all positions within range of 3 from the controller
            const positions = [];
            const controllerPos = roomInfo.room.controller.pos;
            for (let x = -3; x < 3; x++) {
                for (let y = -3; y < 3; y++) {
                    const realX = controllerPos.x + x;
                    const realY = controllerPos.y + y;
                    if (realX <= 0 || realX >= 49 || realY <= 0 || realY >= 49) {
                        continue;
                    }
                    positions.push(roomInfo.room.getPositionAt(realX, realY));
                }
            }

            // Find the valid position adjacent to the most roads that isn't a road itself
            const bestPos = positions.reduce((best, curr) => {
                if (!best) {
                    return curr;
                }
                const invalid = roomInfo.room.getTerrain(curr.x, curr.y) === TERRAIN_MASK_WALL;
                const hasRoad = roomInfo.room.lookForAt(LOOK_STRUCTURES, curr.x, curr.y).find((s) => s.structureType === STRUCTURE_ROAD);
                if (invalid || hasRoad) {
                    return best;
                }
                const currRoads = roomInfo.room.lookForAtArea(LOOK_STRUCTURES, curr.y-1, curr.x-1, curr.y+1, curr.x+1, true).filter(
                    (s) => s.structure.structureType === STRUCTURE_ROAD).length;
                const bestRoads = roomInfo.room.lookForAtArea(LOOK_STRUCTURES, best.y-1, best.x-1, best.y+1, best.x+1, true).filter(
                    (s) => s.structure.structureType === STRUCTURE_ROAD).length;
                return currRoads > bestRoads ? curr : best;
            }, null);

            bestPos.createConstructionSite(STRUCTURE_CONTAINER);
            Memory.bases[roomInfo.room.name].upgraderContainer = bestPos;
            pos = bestPos;
            return;
        }
        const container = roomInfo.room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
        if (!container) {
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
    }

    placeMinerContainer(source) {
        const containerPos = this.placeContainer(source.pos);
        if (Memory.bases[source.pos.roomName]) {
            if (!Memory.bases[source.pos.roomName].minerContainers) {
                Memory.bases[source.pos.roomName].minerContainers = {};
            }
            Memory.bases[source.pos.roomName].minerContainers[source.id] = containerPos;
        }
    }

    placeMineralContainer(mineral) {
        const containerPos = this.placeContainer(mineral.pos);
        if (Memory.bases[mineral.pos.roomName]) {
            if (!Memory.bases[mineral.pos.roomName].mineralContainers) {
                Memory.bases[mineral.pos.roomName].mineralContainers = {};
            }
            Memory.bases[mineral.pos.roomName].mineralContainers[mineral.id] = containerPos;
        }
    }

    placeContainer(forPos) {

        // Find the position adjacent to the target that's also adjacent to the most walls,
        // while still being walkable in order to keep miners out of the way

        function getAdjacentPositions(pos) {
            const positions = [];
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const realX = pos.x + x;
                    const realY = pos.y + y;
                    if (realX <= 0 || realX >= 49 || realY <= 0 || realY >= 49) {
                        continue;
                    }
                    positions.push(new RoomPosition(realX, realY, pos.roomName));
                }
            }
            return positions;
        }

        // Get all adjacent positions to the source
        const adjacent = getAdjacentPositions(forPos);

        // If we already have a container here, let's exit early, no need to plan
        for (const pos of adjacent) {
            const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
            if (sites.length && sites[0].structureType === STRUCTURE_CONTAINER) {
                return pos;
            }
            const containers = pos.lookFor(LOOK_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER);
            if (containers.length) {
                return pos;
            }
        }

        // Now we'll look for the best position by ranking each one based on how many walls are next to it
        const terrain = Game.map.getRoomTerrain(forPos.roomName);
        const bestPosition = adjacent.reduce((best, curr) => {
            if (terrain.get(curr.x, curr.y) === TERRAIN_MASK_WALL) {
                return best;
            }
            if (!best) {
                return curr;
            }

            // Count all adjacent walls to the current position
            const currAdjacent = getAdjacentPositions(curr).reduce((total, p) => {
                total + (terrain.get(p.x, p.y) === TERRAIN_MASK_WALL ? 1 : 0);
            }, 0);

            // Count all adjacent walls to the best position
            const bestAdjacent = getAdjacentPositions(best).reduce((total, p) => {
                total + (terrain.get(p.x, p.y) === TERRAIN_MASK_WALL ? 1 : 0);
            }, 0);

            return currAdjacent > bestAdjacent ? curr : best;
        }, null);

        if (!bestPosition) {
            return;
        }

        // Let's record the container in memory and create the construction site
        bestPosition.createConstructionSite(STRUCTURE_CONTAINER);
        return bestPosition;
    }
}

module.exports = ColonyConstructionManager;