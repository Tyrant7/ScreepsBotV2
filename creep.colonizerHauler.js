const { roles } = require("./constants");
const HaulerManager = require("./creep.hauler");
const Task = require("./data.task");

class ColonizerHaulerManager extends HaulerManager {
    createTask(creep, colony) {
        if (creep.memory.target === creep.room.name) {
            if (creep.room.controller.my) {
                creep.memory.home = creep.room.name;
                creep.memory.role = roles.hauler;
            }
            // We'll wait until our room has been claimed
            return;
        }
        return this.createMoveTask(creep);
    }

    createMoveTask(creep) {
        const actionStack = [super.basicActions.moveToRoom];
        return new Task(
            { roomName: creep.memory.target, maxRooms: 64, maxOps: 64000 },
            "move",
            actionStack
        );
    }
}

module.exports = ColonizerHaulerManager;
