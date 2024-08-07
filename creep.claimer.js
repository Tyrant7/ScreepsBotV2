const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");

class ClaimerManager extends CreepManager {
    createTask(creep, colony) {
        if (creep.memory.mission === creep.room.name) {
            if (creep.room.controller.my) {
                // Purpose fulfilled
                creep.memory.home = creep.room.name;
                return;
            }
            return this.createClaimTask();
        }
        return this.createMoveTask(creep);
    }

    createClaimTask() {
        const actionStack = [
            function (creep, data) {
                if (creep.room.controller.my) {
                    return true;
                }

                if (creep.pos.getRangeTo(creep.room.controller) > 1) {
                    creep.betterMoveTo(creep.room.controller.pos);
                    return false;
                }
                creep.claimController(creep.room.controller);
            },
        ];
        return new Task({}, "claim", actionStack);
    }

    createMoveTask(creep) {
        const actionStack = [this.basicActions.moveToRoom];
        return new Task(
            {
                roomName: creep.memory.mission,
                maxRooms: 64,
                maxOps: 64000,
                pathSet: pathSets.travel,
            },
            "move",
            actionStack
        );
    }
}

module.exports = ClaimerManager;
