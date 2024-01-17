const creepSpawnUtility = require("creepSpawnUtility");

class MinerSpawnInfo {

    getPriority(roomInfo) {

        // No workers, no miners
        const workerCount = creepSpawnUtility.getPredictiveCreeps(roomInfo.workers).length;
        if (!workerCount) {
            return 0;
        }

        // All miners already exists
        const sourceCount = roomInfo.getUnreservedSources().length;
        if (!sourceCount) {
            return 0;
        }

        // Extremely simple calculation -> more workers and source = more miners
        return (workerCount / 3) + (sourceCount * 3);
    }

    make(roomInfo) {

        // Make sure we have a source
        const source = roomInfo.getUnreservedSources()[0];
        if (!source) {
            return;
        }

        // Calculate an average energy produced for this source
        const energy = source.energyCapacity / ENERGY_REGEN_TIME;

        // Figure out how many WORK parts it will take to harvest this source
        const workCount = (energy / HARVEST_POWER) + 1;

        // Create a miner for this work count and assign its source
        let body = [MOVE, MOVE, MOVE];
        let lvl = 0;
        for (let i = 0; i < workCount; i++) {
            body.push(WORK);
            lvl = i + 1;
            if (creepSpawnUtility.getCost(body) > roomInfo.room.energyCapacityAvailable) {
                body.pop();
                break;
            }
        }
        return { body: body, 
                 cost: creepSpawnUtility.getCost(body),
                 name: "Miner " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.miner,
                           sourceID: source.id }};
    }
}

module.exports = MinerSpawnInfo;