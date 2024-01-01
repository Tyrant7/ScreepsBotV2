const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class MinerTaskGenerator {

    run(roomInfo, taskHandler) {
        // Nothing to do here; miners do not need special tasks
    }

    generateDefaultTask(roomInfo) {

        // Generate default miner behaviour
        const actionStack = [];
        actionStack.push(function(creep, target) {

            // Simply mine assigned source
            if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }

            // Always return false since miners can never finish their task
            return false;
        });

        const task = new Task(creep.memory.sourceID, "mine", actionStack);
        return new TaskPoolEntry(task, 0);
    }
}

module.exports = MinerTaskGenerator;