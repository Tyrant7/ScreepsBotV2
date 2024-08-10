const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");
const estimateTravelTime = require("./util.estimateTravelTime");

class DuoManager extends CreepManager {
    createTask(creep, colony) {
        // Pair dies, we should unpair
        if (!Game.creeps[creep.memory.pair]) {
            delete creep.memory.pair;
        }

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

        console.log("hmmm");

        if (creep.room.name === creep.memory.mission) {
            return this.createAttackTask(creep, colony);
        }
        return this.createMoveTask(creep, colony);
    }

    createMoveTask(creep, colony) {
        if (creep.memory.superior) {
            const actionStack = [
                function (creep, { moveToRoom, options }) {
                    const pair = Game.creeps[creep.memory.pair];
                    if (!pair) return true;

                    // We'll handle room edges a little differently
                    const onRoomEdge =
                        creep.pos.x >= 49 ||
                        creep.pos.x <= 0 ||
                        creep.pos.y >= 49 ||
                        creep.pos.x <= 0;

                    // Stay next to our pair
                    if (
                        !onRoomEdge &&
                        estimateTravelTime(creep.pos, pair.pos) > 1
                    )
                        return false;
                    moveToRoom(creep, options);
                },
            ];
            const options = {
                roomName: creep.memory.mission,
                maxRooms: 32,
                maxOps: 16384,
                pathSet: pathSets.travel,
            };
            return new Task(
                {
                    moveToRoom: this.basicActions.moveToRoom,
                    options,
                },
                "lead",
                actionStack
            );
        }

        const actionStack = [
            function (creep, data) {
                const pair = Game.creeps[creep.memory.pair];
                if (!pair) return true;
                creep.betterMoveTo(pair, {
                    range: 0,
                    pathSet: pathSets.travel,
                });
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                } else if (pair.hits < pair.hitsMax) {
                    creep.heal(pair);
                }
            },
        ];
        return new Task({}, "follow", actionStack);
    }

    createAttackTask(creep, colony) {
        return new Task({}, "attack", [
            function (creep, colony) {
                creep.say("kill");
                return false;
            },
        ]);
    }
}

module.exports = DuoManager;
