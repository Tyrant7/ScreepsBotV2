const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");

class ClaimerManager extends CreepManager {
    createTask(creep, colony) {
        if (creep.memory.target === creep.room.name) {
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
        const actionStack = [super.basicActions.moveToRoom];
        creep.memory.target = target;
        return new Task(
            { roomName: target, maxRooms: 64, maxOps: 64000 },
            "move",
            actionStack
        );
    }
}

module.exports = ClaimerManager;
