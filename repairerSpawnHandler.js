const makeWorkerBody = require("makeWorkerBody");

class RepairerSpawnHandler {

    getNextSpawn(roomInfo) {
        if (roomInfo.repairers.length) {
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
                 name: "Repairer " + Game.time + " [" + level + "]",
                 memory: { role: CONSTANTS.roles.repairer }};
    }
}

// Don't be too concerned unless these structures get extra low since they decay naturally
const repairThresholds = {
    [STRUCTURE_WALL]: 0.002,
    [STRUCTURE_RAMPART]: 0.005,
    [STRUCTURE_CONTAINER]: 0.5,
    [STRUCTURE_ROAD]: 0.5
};

module.exports = RepairerSpawnHandler;