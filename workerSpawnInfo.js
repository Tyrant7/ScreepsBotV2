const creepSpawnUtility = require("creepSpawnUtility");

class WorkerSpawnInfo {

    getPriority(roomInfo) {

        // We need workers always
        const workerCount = creepSpawnUtility.getPredictiveCreeps(roomInfo.workers).length;
        if (workerCount <= 2) {
            return 1000;
        }

        // An estimation for how much energy workers would use per part on average per tick
        const neededWorkParts = roomInfo.getMaxIncome() * 1;
        const workerBody = this.make(roomInfo);
        if (!workerBody) {
            return 0;
        }
        const neededWorkers = neededWorkParts / workerBody.body.filter((p) => p === WORK).length;
        return (neededWorkers * 2.5);
    }

    make(roomInfo) {

        // Sum up existing part counts for workers
        const predictiveWorkers = creepSpawnUtility.getPredictiveCreeps(roomInfo.workers);
        const workCount = predictiveWorkers.reduce((total, curr) => total + curr.body.filter((p) => p.type === WORK).length, 0);

        // Workers are allocated based on number of WORK parts
        // Before we have miners -> allocate workers based on count using: nSourceSpots + 1
        // With miners -> use the formula: X WORK parts per Y max income
        // Ratio determined through minimal testing to be an acceptable value
        const incomeToPartRatio = 1.25;
        const maxWorkParts = roomInfo.miners.length ? Math.ceil(roomInfo.getMaxIncome() * incomeToPartRatio) 
            // Averaging the worker parts to allocate based on worker count instead of part count
            : roomInfo.openSourceSpots * (workCount / predictiveWorkers.length) + 1;
    
        // Adjust level so that we spawn lower level workers to avoid exceeding our WORK part max
        const adjustedLevel = Math.min(CONSTANTS.maxWorkerLevel, maxWorkParts - workCount);
        if (adjustedLevel <= 0) {
            return;
        }

        // Let's make the body and composition
        const workerParts = [WORK, CARRY, MOVE];
        let body = workerParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < adjustedLevel && (lvl + 1) * levelCost <= roomInfo.room.energyCapacityAvailable) {
            lvl++;
            body = body.concat(workerParts);
        }
        return { body: body, 
                 cost: lvl * levelCost,
                 name: "Worker " + Game.time + " [" + lvl.toString() + "]",
                 memory: { role: CONSTANTS.roles.worker }};
    }
}

module.exports = WorkerSpawnInfo;