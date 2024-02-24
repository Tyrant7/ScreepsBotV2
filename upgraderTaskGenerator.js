const Task = require("task");

class UpgraderTaskGenerator {

    /**
     * Generates an "upgrade" task for this upgrader.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current reserver tasks to take into consideration when finding a new task.
     * @returns {Task[]} An array of a single task object.
     */
    run(creep, roomInfo, activeTasks) {

        const actionStack = []
        actionStack.push(function(creep, target) {

            const intentResult = creep.upgradeController(target);
            if (intentResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }
            else if (intentResult === OK) {
                // Find our upgrader container
                const base = Memory.bases[target.room.name];
                const upgraderContainerPos = base.upgraderContainer;
                if (!upgraderContainerPos) {
                    return;
                }
                // We're within range of our container already!
                if (creep.pos.getRangeTo(upgraderContainerPos) <= 1) {
                    // Pickup energy if we need it
                    const energyUsage = creep.body.filter((p) => p.type === WORK).length * UPGRADE_CONTROLLER_POWER;
                    if (creep.store.getFreeCapacity() >= energyUsage) {
                        const container = creep.room.lookForAt(LOOK_STRUCTURES, upgraderContainerPos.x, upgraderContainerPos.y).find(
                            (s) => s.structureType === STRUCTURE_CONTAINER);
                        creep.withdraw(container, RESOURCE_ENERGY);
                    }
                    return;
                }
                creep.moveTo(upgraderContainerPos);
            }
        });
        return [new Task(roomInfo.room.controller.id, "upgrade", actionStack)];
    }
}

module.exports = UpgraderTaskGenerator;