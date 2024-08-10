const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");

class DuoManager extends CreepManager {
    createTask(creep, colony) {
        return new Task({}, "exist", [
            function (creep, colony) {
                creep.say("Duo " + (creep.memory.superior ? "lead" : "follow"));
                return false;
            },
        ]);
    }
}

module.exports = DuoManager;
