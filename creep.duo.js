const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");

class DuoManager extends CreepManager {
    createTask(creep, colony) {
        // Let's pair all unpaired duos, superior with inferior
        if (!creep.memory.pair) {
            const pair = colony.combatDuos.find(
                (d) =>
                    d.memory.superior !== creep.memory.superior &&
                    !d.memory.pair
            );
            if (pair) {
                creep.memory.pair = pair.name;
                pair.memory.pair = creep.name;
            }
        }

        return new Task({}, "exist", [
            function (creep, colony) {
                creep.say("Duo " + creep.memory.pair);
                return false;
            },
        ]);
    }
}

module.exports = DuoManager;
