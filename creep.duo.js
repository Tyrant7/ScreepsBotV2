const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");
const estimateTravelTime = require("./util.estimateTravelTime");
const { selectCombatTarget } = require("./combat.combatUtility");

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

        if (creep.memory.superior) {
            return this.createLeaderTask(creep);
        }
        return new Task({}, "follow", function (creep, data) {
            return false;
        });
    }

    createLeaderTask(creep) {
        const actionStack = [
            function (creep, { moveToRoom }) {
                const pair = Game.creeps[creep.memory.pair];
                if (!pair) return true;

                // Here we'll control our pair through this task to maximize the coordination
                // between our two creeps
                // Our pair will preheal itself if inside the mission room
                if (
                    pair.hits < pair.hitsMax ||
                    creep.room.name === creep.memory.mission
                ) {
                    pair.heal(pair);
                } else if (creep.hits < creep.hitsMax) {
                    pair.heal(creep);
                }

                const target = Game.getObjectById(creep.memory.targetID);
                if (!target && creep.room.name === creep.memory.mission) {
                    // Choose a target if we don't have one yet
                    const t = selectCombatTarget(creep, creep.room);
                    if (!t) return true;
                    creep.memory.targetID = t.id;
                    creep.memory.targetPos = t.pos;
                }

                // Attack our target
                if (target && creep.pos.getRangeTo(target) <= 1) {
                    creep.smartAttack(target);
                    return false;
                }

                // Keep our pair following us as long as we're moving
                pair.betterMoveTo(creep, {
                    range: 0,
                    pathSet: pathSets.travel,
                });

                // We'll handle room edges a little differently
                const onRoomEdge =
                    creep.pos.x >= 48 ||
                    creep.pos.x <= 1 ||
                    creep.pos.y >= 48 ||
                    creep.pos.x <= 1;
                // Stay next to our pair
                if (!onRoomEdge && estimateTravelTime(creep.pos, pair.pos) > 1)
                    return false;

                // Move to our target
                // Note that this position is separate:
                // In case we leave the room on the way to our target
                // we don't want to change our movement target
                if (creep.memory.targetPos) {
                    const movePos = new RoomPosition(
                        creep.memory.targetPos.x,
                        creep.memory.targetPos.y,
                        creep.memory.targetPos.roomName
                    );
                    creep.betterMoveTo(movePos, {
                        pathSet: pathSets.travel,
                    });
                    return false;
                }
                moveToRoom(creep, {
                    roomName: creep.memory.mission,
                    maxRooms: 32,
                    maxOps: 16384,
                    pathSet: pathSets.travel,
                });
            },
        ];
        return new Task(
            {
                moveToRoom: this.basicActions.moveToRoom,
            },
            "lead",
            actionStack
        );
    }
}

module.exports = DuoManager;
