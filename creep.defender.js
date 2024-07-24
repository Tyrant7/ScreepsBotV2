const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");

class DefenderManager extends CreepManager {
    createTask(creep, colony) {
        // Find our enemies
        const enemies = colony.getEnemies();
        if (enemies.length === 0) {
            // Follow our enemy if they're still in one of our rooms
            if (
                creep.memory.lastSeen &&
                creep.pos.roomName !== creep.memory.lastSeen
            ) {
                const actionStack = [this.basicActions.moveToRoom];
                return new Task(
                    { roomName: creep.memory.lastSeen },
                    "pursue",
                    actionStack
                );
            }
            return null;
        }
        return this.createKillTask(creep, enemies[0]);
    }

    createKillTask(creep, target) {
        const actionStack = [];
        actionStack.push(function (creep, data) {
            // Our target died or fled
            const target = Game.getObjectById(data.targetID);
            if (!target) {
                return true;
            }

            // Find the lowest health creep within healing range
            if (creep.body.find((p) => p.type === HEAL)) {
                const p = creep.pos;
                let lowest = creep;
                if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
                    lowest = creep.room
                        .lookForAtArea(
                            LOOK_CREEPS,
                            p.y - 1,
                            p.x - 1,
                            p.y + 1,
                            p.x + 1,
                            true
                        )
                        .reduce((lowest, curr) => {
                            if (!curr.my) {
                                return lowest;
                            }
                            return curr.hits < lowest.hits ? curr : lowest;
                        }, creep);
                }
                if (lowest.hits < lowest.hitsMax) {
                    creep.heal(lowest);
                }
            }

            // Follow and attack our target!
            creep.say("🛡️", true);
            if (creep.rangedAttack(target) === ERR_NOT_IN_RANGE) {
                creep.betterMoveTo(target, {
                    range: 2,
                });
            }
            return target.hits <= 0;
        });

        // Save where we last saw the enemy in case we lose sight of them
        creep.memory.lastSeen = target.pos.room;
        return new Task({ targetID: target.id }, "kill", actionStack);
    }
}

module.exports = DefenderManager;
