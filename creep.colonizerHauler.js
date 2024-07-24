const { roles, pathSets } = require("./constants");
const HaulerManager = require("./creep.hauler");
const Task = require("./data.task");

class ColonizerHaulerManager extends HaulerManager {
    createTask(creep, colony) {
        if (creep.memory.expansionTarget === creep.room.name) {
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
        const actionStack = [
            function (creep, data) {
                // We'll fill ourselves up at the storage before going to our target room
                if (creep.store[RESOURCE_ENERGY]) {
                    return true;
                }
                if (creep.pos.getRangeTo(creep.room.storage) <= 1) {
                    creep.withdraw(
                        creep.room.storage,
                        RESOURCE_ENERGY,
                        creep.store.getFreeCapacity()
                    );
                    return false;
                }
                creep.betterMoveTo(creep.room.storage, {
                    range: 1,
                    pathSet: pathSets.default,
                });
            },
            this.basicActions.moveToRoom,
        ];
        return new Task(
            {
                roomName: creep.memory.expansionTarget,
                maxRooms: 64,
                maxOps: 64000,
            },
            "move",
            actionStack
        );
    }
}

module.exports = ColonizerHaulerManager;
