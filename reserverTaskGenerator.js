const Task = require("task");
const moveToRoom = require("moveToRoom");

class ReserverTaskGenerator {

    /**
     * Generates a "reserve" task for this reserver.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current reserver tasks to take into consideration when finding a new task.
     * @returns The best fitting task for this creep.
     */
    run(creep, roomInfo, activeTasks) {

        // If we're in the room, let's perpetually reserve until we die
        if (creep.room.name === creep.memory.targetRoom) {
            const controller = creep.room.controller;
            const actionStack = [];
            actionStack.push(function(creep, data) {
                const controller = Game.getObjectById(data.controllerID);
                if (creep.reserveController(controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(controller);
                }
            });
            return new Task({ controllerID: controller.id }, "reserve", actionStack);
        }

        // If we're not in the room yet, let's get over there
        const actionStack = [moveToRoom];
        return new Task({ roomName: creep.memory.targetRoom }, "move", actionStack);
    }
}

module.exports = ReserverTaskGenerator;