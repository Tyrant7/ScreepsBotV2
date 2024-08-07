const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");

class ClaimerManager extends CreepManager {
    createTask(creep, colony) {
        // If: has mission
        // move to mission location
    }
}

module.exports = ClaimerManager;
