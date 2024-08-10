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
            } else {
                return new Task({ time: Game.time }, "wait", function (
                    creep,
                    { time }
                ) {
                    creep.say("no pair!");
                    return time < Game.time;
                });
            }
        }

        if (creep.room.name === creep.memory.mission)
            return new Task({}, "exist", [
                function (creep, colony) {
                    creep.say("Duo " + creep.memory.pair);
                    return false;
                },
            ]);
    }

    createMoveTask(creep, colony) {}

    createAttackTask(creep, colony) {}
}

module.exports = DuoManager;
