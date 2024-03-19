const creepSpawnUtility = require("creepSpawnUtility");

class BuilderSpawnHandler {

    getNextSpawn(roomInfo) {

        // Don't allow us to exceed a hard max of builders
        if (roomInfo.builders.length >= CONSTANTS.maxBuilderCount) {
            return;
        }

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
        // N WORK = Math.ceil(totalEnergyToBuild / 1000)
        const wantedWork = Math.max(Math.ceil((energyForThisRoom + energyForRemotes) / 1000) - existingWork, 0);
        if (wantedWork > 0) {
            return this.make(wantedWork, roomInfo.room.energyCapacityAvailable);
        }
    }

    make(desiredLevel, energy) {
        const builderParts = [WORK, CARRY, MOVE];
        let body = builderParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < desiredLevel && (lvl + 1) * levelCost <= energy && body.length <= 50 - builderParts.length) {
            lvl++;
            body = body.concat(builderParts);
        }
        return { body: body,
                 name: "Builder " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.builder }};
    }
}

module.exports = BuilderSpawnHandler;