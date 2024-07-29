const { pathSets } = require("./constants");
const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");

class CleanerManager extends CreepManager {
    createTask(creep, colony) {
        const actionStack = [
            function (creep, targetID) {
                const core = Game.getObjectById(targetID);
                if (!core) {
                    delete creep.memory.target;
                    return true;
                }

                creep.say("🧹", true);
                if (creep.pos.getRangeTo(core.pos) <= 1) {
                    creep.attack(core);
                    return false;
                }
                creep.betterMoveTo(core.pos, {
                    pathSet: pathSets.travel,
                });
            },
        ];

        // Search for the first invader core that isn't taken yet
        let targetID = creep.memory.target;
        if (!targetID) {
            const unclaimedCore = colony.invaderCores.find(
                (core) =>
                    !colony.cleaners.find(
                        (cleaner) => cleaner.memory.target === core.id
                    )
            );
            if (!unclaimedCore) {
                return;
            }
            targetID = unclaimedCore.id;
        }
        // Idle if we can't find a core to kill
        if (!targetID) {
            return;
        }
        creep.memory.target = targetID;
        return new Task(targetID, "clean", actionStack);
    }
}

module.exports = CleanerManager;
