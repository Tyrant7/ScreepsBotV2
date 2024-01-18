const creepSpawnUtility = require("creepSpawnUtility");

class MinerSpawnHandler {

    getNextSpawn(roomInfo) {
        const sources = roomInfo.getUnreservedSources();
        for (const source of sources) {

            // Calculate an average energy produced for this source
            const energy = source.energyCapacity / ENERGY_REGEN_TIME;

            // Figure out how many WORK parts it will take to harvest this source
            const workCount = (energy / HARVEST_POWER) + 1;

            // Make a miner!
            let body = [MOVE, MOVE, MOVE];
            let lvl = 0;
            for (let i = 0; i < workCount; i++) {
                lvl++;
                body.push(WORK);
                if (creepSpawnUtility.getCost(body) > roomInfo.room.energyCapacityAvailable) {
                    lvl--;
                    body.pop();
                    break;
                }
            }
            return { body: body, 
                     name: "Miner " + Game.time + " [" + lvl + "]",
                     memory: { role: CONSTANTS.roles.miner,
                               sourceID: source.id }};
        }
    }
}

module.exports = MinerSpawnHandler;