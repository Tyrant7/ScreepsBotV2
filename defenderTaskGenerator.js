const Task = require("task");
const moveToRoom = require("moveToRoom");

class DefenderTaskGenerator {

    run(creep, roomInfo, activeTasks) {

        // Find our enemies
        const enemies = roomInfo.getEnemies();
        if (enemies.length === 0) {
            creep.suicide();
            return null;
        }

        // Find our strongest enemy
        const strongestEnemy = enemies.reduce((strongest, curr) => {
            const currFightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL);
            const strongestFightParts = strongest.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL);
            return currFightParts > strongestFightParts ? curr : strongest;
        }, enemies[0]);

        const actionStack = [];
        actionStack.push(function(creep, data) {

            // Our target died or fleed
            const target = Game.getObjectById(data.targetID);
            if (!target) {
                return true;
            }

            // Find the lowest health creep within healing range
            if (creep.body.find((p) => p.type === HEAL)) {
                const p = creep.pos;
                let lowest = creep;
                if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
                    lowest = creep.room.lookForAtArea(LOOK_CREEPS, p.y-1, p.x-1, p.y+1, p.x+1, true).reduce((lowest, curr) => {
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
                creep.moveTo(target, {
                    range: 2,
                });
            }
            return target.hits <= 0;
        });

        return new Task({ targetID: strongestEnemy.id }, "kill", actionStack);
    }
}

module.exports = DefenderTaskGenerator;