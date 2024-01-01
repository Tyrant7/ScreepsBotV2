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
            
        });

        const task = new Task(creep.memory.sourceID, "mine", actionStack);
    }
}

module.exports = MinerTaskGenerator;