const makeWorkerBody = require("makeWorkerBody");

class BuilderSpawnHandler {

    getNextSpawn(roomInfo) {
        if (roomInfo.builders.length) {
            return;
        }

        // Look for any structure below its repair threshold
        const repairStructure = roomInfo.getWantedStructures().find((s) => {
            const threshold = repairThresholds[s.structureType] || 1;
            return s.hits / s.hitsMax <= threshold;
        });
        if (repairStructure) {
            return this.make(roomInfo.room.energyCapacityAvailable);
        }
    }

    make(energy) {
        const body = makeWorkerBody(CONSTANTS.maxRepairerLevel, energy);
        const level = body.filter((p) => p === WORK).length;
        return { body: body, 
                 name: "Builder " + Game.time + " [" + level + "]",
                 memory: { role: CONSTANTS.roles.repairer }};
    }
}

module.exports = BuilderSpawnHandler;