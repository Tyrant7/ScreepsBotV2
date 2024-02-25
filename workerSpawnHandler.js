const creepSpawnUtility = require("creepSpawnUtility");
const LeveledSpawnHandler = require("leveledSpawnHandler");

class WorkerSpawnHandler extends LeveledSpawnHandler {

    /**
     * Figures out the ideal spawn levels for workers in this room.
     * @param {RoomInfo} roomInfo The info object associated with the room.
     * @returns An array of levels for the ideal workers in this room. Each element corresponds to a creep.
     */
    getIdealSpawns(roomInfo) {

        // Figure out how many WORK parts we ideally want
        const incomeToPartRatio = 1.2;
        const maxWorkParts = roomInfo.miners.length ? Math.ceil(roomInfo.getMaxIncome() * incomeToPartRatio)
            : roomInfo.openSourceSpots + 1;

        // Find the most expensive worker we can build in this room
        const levelCost = creepSpawnUtility.getCost([WORK, CARRY, MOVE]);
        const workerLevel = Math.min(roomInfo.room.energyCapacityAvailable / levelCost, CONSTANTS.maxWorkerLevel);

        // Let's adjust the number of workers we want depending on our upgraders
        const upgraderWorkParts = roomInfo.upgraders.reduce((total, upgrader) => {
            return total + upgrader.body.filter((p) => p.type === WORK).length;
        }, 0);

        // Subtract number of work parts we have in upgraders from our wanted work parts
        // Since they will use up a lot of energy more efficiently than us
        // Never fewer than one worker, however
        const wantedWorkParts = Math.max(maxWorkParts - upgraderWorkParts, workerLevel);

        // Divide our desired part count to get our desired number of workers
        const workerCount = Math.floor(wantedWorkParts / workerLevel);

        // If we have leftover parts that didn't fit into a max size worker, let's make a smaller one
        const leftover = wantedWorkParts % workerLevel;

        // Add these desired workers to the queue, pushing the leftover last
        const queue = [];
        if (leftover > 0) {
            queue.push(leftover);
        }
        for (let i = 0; i < workerCount; i++) {
            queue.push(workerLevel);
        }
        return queue;
    }

    /**
     * Figures out the levels of all workers in this room, excluding ones that will die before being replaced.
     * @param {RoomInfo} roomInfo The info object associated with the room.
     * @returns {number[]} An array of levels for current workers in this room. Each elements corresponds to a creep.
    */
    getRealMembers(roomInfo) {
        const predictiveWorkers = creepSpawnUtility.getPredictiveCreeps(roomInfo.workers);
        return predictiveWorkers.map((h) => h.body.filter((p) => p.type === WORK).length);
    }

    make(desiredLevel, energy) {
        const workerParts = [WORK, CARRY, MOVE];
        let body = workerParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < desiredLevel && (lvl + 1) * levelCost <= energy) {
            lvl++;
            body = body.concat(workerParts);
        }
        return { body: body, 
                 name: "Worker " + Game.time + " [" + lvl.toString() + "]",
                 memory: { role: CONSTANTS.roles.worker }};
    }
}

module.exports = WorkerSpawnHandler;