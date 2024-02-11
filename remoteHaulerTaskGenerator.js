const Task = require("task");
const moveToRoom = require("moveToRoom");

class RemoteHaulerTaskGenerator {

    /**
     * Creates an appropriate "move", "gather", or "deposit" task for this hauler depending on its state.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current remote hauler tasks to take into consideration when finding a new task.
     * @returns {Task[]} An array of a single task object.
     */
    run(creep, roomInfo, activeTasks) {

        // Wait for a target before
        if (!creep.memory.targetRoom) {
            creep.say("No room!");
            return null;
        }

        if (creep.store.getFreeCapacity()) {
            return this.createGatherTask(creep);
        }
        return this.createDepositTask(roomInfo);
    }

    createGatherTask(creep) {

        const actionStack = [];
        actionStack.push(function(creep, containerPos) {

            // If we have view of the room, do our task like normal
            if (Game.rooms[containerPos.roomName]) {
                const container = containerPos.lookFor(LOOK_STRUCTURES, { filter: { structureType: STRUCTURE_CONTAINER } });
                if (!container) {
                    // Our container disappeared
                    if (creep.room.name === containerPos.name) {
                        return true;
                    }
    
                    // We're probably not in the room yet, let's keep going
                    creep.moveTo(containerPos);
                }
            }
            else {
                // Otherwise, we'll have to go there before we can tell
                creep.moveTo(containerPos);
            }

            // Let's simply go to our container
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(containerPos);
            }
            return creep.store.getFreeCapacity() === 0;
        });
        
        const container = creep.memory.container;
        return [new Task(new RoomPosition(container.x, container.y, container.roomName), "gather", actionStack)];
    }

    createDepositTask(roomInfo) {
        const actionStack = [];
        actionStack.push(function(creep, storage) {

            // We're returning back to the room's storage
            if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            }
            return creep.store[RESOURCE_ENERGY] === 0;
        });
        return [new Task(roomInfo.room.storage.id, "gather", actionStack)];
    }
}

module.exports = RemoteHaulerTaskGenerator;