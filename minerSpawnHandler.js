const creepSpawnUtility = require("creepSpawnUtility");

class MinerSpawnHandler {

    getNextSpawn(roomInfo) {
        const sources = roomInfo.getUnreservedSources();
        if (sources.length > 0) {
            return this.make(roomInfo.room.energyCapacityAvailable);
        }
    }

    getIdealSpawns(roomInfo) {
        const spawns = [];
        const sources = roomInfo.getSources();
        for (const source of sources) {
            spawns.push(this.make(roomInfo.room.energyCapacityAvailable));
        }
        return spawns;
    }

    make(maxCost) {
        // Calculate an average energy produced for this source
        const sourceEnergy = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;

        // Figure out how many WORK parts it will take to harvest this source
        const workCount = (sourceEnergy / HARVEST_POWER) + 1;

        // Make a miner!
        let body = [MOVE, MOVE, MOVE];
        let lvl = 0;
        for (let i = 0; i < workCount; i++) {
            lvl++;
            body.push(WORK);
            if (creepSpawnUtility.getCost(body) > maxCost) {
                lvl--;
                body.pop();
                break;
            }
        }
        return { body: body, 
                 name: "Miner " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.miner }};
    }

    getTotalAvgSpawnTime(roomInfo) {
        return this.getIdealSpawns(roomInfo).reduce(
            (total, curr) => total + creepSpawnUtility.getSpawnTime(curr.body), 0)
            / CREEP_LIFE_TIME;
    }
}

module.exports = MinerSpawnHandler;