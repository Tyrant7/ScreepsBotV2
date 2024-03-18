const makeWorkerBody = require("makeWorkerBody");
const remoteUtility = require("remoteUtility");

class BuilderSpawnHandler {

    getNextSpawn(roomInfo) {

        // First figure out how much energy it will take to build our desired structures
        const energyForThisRoom = roomInfo.constructionSites.reduce((total, curr) => {
            return total + (curr.progressTotal - curr.progress);
        }, 0);
        const energyForRemotes = roomInfo.getConstructionQueue().reduce((total, curr) => {
            return total + CONSTRUCTION_COST[curr.type];
        }, 0);

        // Figure out how much WORK we already have
        const existingWork = roomInfo.builders.reduce((total, curr) => {
            return total + curr.body.filter((p) => p.type === WORK).length;
        }, 0);

        // Finally, let's allocate an arbitrary amount of WORK using this formula
        // N WORK = Math.ceil(totalEnergyToBuild / 1500)
        const wantedWork = Math.max(Math.ceil((energyForThisRoom + energyForRemotes) / 1500) - existingWork, 0);
        if (wantedWork > 0) {
            return this.make(wantedWork, roomInfo.room.energyCapacityAvailable);
        }
    }

    make(desiredLevel, energy) {
        const worker = makeWorkerBody(Math.min(desiredLevel, CONSTANTS.maxBuilderLevel), energy);
        return { body: worker.body, 
                 name: "Builder " + Game.time + " [" + worker.level + "]",
                 memory: { role: CONSTANTS.roles.builder }};
    }
}

module.exports = BuilderSpawnHandler;