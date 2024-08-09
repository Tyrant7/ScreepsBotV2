const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");

class DuoManager extends CreepManager {
    createTask(creep, colony) {
        return new Task({}, "exist", [
            function (creep, colony) {
                creep.say(
                    "I'm a duo " +
                        (creep.memory.superior ? "leader" : "follower")
                );
                return false;
            },
        ]);
    }
}

module.exports = DuoManager;
