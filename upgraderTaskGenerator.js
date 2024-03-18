const Task = require("task");

class UpgraderTaskGenerator {

    /**
     * Generates an "upgrade" task for this upgrader.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current reserver tasks to take into consideration when finding a new task.
     * @returns An upgrade task.
     */
    run(creep, roomInfo, activeTasks) {

        const actionStack = []
        actionStack.push(function(creep, data) {

            const target = Game.getObjectById(data.controllerID);

            // Find our upgrader container
            const base = Memory.bases[target.room.name];
            const upgraderContainerPos = new RoomPosition(
                base.upgraderContainer.x, base.upgraderContainer.y, base.upgraderContainer.roomName
            );

            // We're within range of our container already!
            if (creep.pos.getRangeTo(upgraderContainerPos) <= data.range) {
                // Pickup energy if we need it
                const energyUsage = creep.body.filter((p) => p.type === WORK).length * UPGRADE_CONTROLLER_POWER;
                if (creep.store[RESOURCE_ENERGY] <= energyUsage) {
                    const container = creep.room.lookForAt(LOOK_STRUCTURES, upgraderContainerPos.x, upgraderContainerPos.y).find(
                        (s) => s.structureType === STRUCTURE_CONTAINER);
                    if (container.store[RESOURCE_ENERGY]) {
                        creep.withdraw(container, RESOURCE_ENERGY);
                    }
                }
                creep.upgradeController(target);
            }
            else {
                creep.moveTo(upgraderContainerPos, {
                    reusePath: 1000,
                    maxRooms: 1,
                });
            }
        });
        
        // Multiple upgraders should clump up, but not fight for the spot
        const range = activeTasks.length ? 1 : 0;
        return new Task({ controllerID: roomInfo.room.controller.id,
                          range: range }, "upgrade", actionStack);
    }
}

module.exports = UpgraderTaskGenerator;