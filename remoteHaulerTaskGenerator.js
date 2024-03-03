const Task = require("task");

class RemoteHaulerTaskGenerator {

    /**
     * Creates an appropriate "move", "gather", or "deposit" task for this hauler depending on its state.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current remote hauler tasks to take into consideration when finding a new task.
     * @returns The best fitting task for this creep.
     */
    run(creep, roomInfo, activeTasks) {

        // Wait for a target before
        if (!creep.memory.container) {
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
        actionStack.push(function(creep, data) {

            // If we have view of the room, do our task like normal
            const pickupPos = data.pickupPos;
            if (!Game.rooms[pickupPos.roomName]) {
                creep.moveTo(pickupPos);
                return creep.store.getFreeCapacity() === 0;
            }

            const container = pickupPos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER);
            if (container) {

                // Let's simply go to our container
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container);
                }
                return creep.store.getFreeCapacity() === 0 || container.store[RESOURCE_ENERGY] === 0;
            }
            else {
                // Our container isn't built yet or was destroyed
                // Let's simply pickup from the ground instead
                const droppedEnergy = pickupPos.lookFor(LOOK_RESOURCES).find((s) => s.resourceType === RESOURCE_ENERGY);
                if (droppedEnergy) {
                    if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedEnergy);
                    }
                }
                else {
                    return true;
                }

                return creep.store.getFreeCapacity() === 0 || droppedEnergy.amount === 0;
            }
        });
        
        const container = creep.memory.container;
        return new Task({ pickupPos: new RoomPosition(container.x, container.y, container.roomName) }, "gather", actionStack);
    }

    createDepositTask(roomInfo) {
        const actionStack = [];
        actionStack.push(function(creep, data) {

            // Allow creeps like builders to pull energy off of us if needed
            creep.memory.openPull = true;

            // We're returning back to the room's storage
            const storage = Game.getObjectById(data.storageID);
            if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            }

            if (creep.store[RESOURCE_ENERGY] === 0) {
                delete creep.memory.openPull;
                return true;
            }
            return false;
        });
        return new Task({ storageID: roomInfo.room.storage.id }, "gather", actionStack);
    }
}

module.exports = RemoteHaulerTaskGenerator;