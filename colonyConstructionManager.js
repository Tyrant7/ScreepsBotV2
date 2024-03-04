class ColonyConstructionManager {
    
    run(roomInfo) {
        if (roomInfo.room.controller.level >= 2) {
            this.placeUpgraderContainer(roomInfo);
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
        }
        const container = roomInfo.room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
        if (!container) {
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
    }
}

module.exports = ColonyConstructionManager;