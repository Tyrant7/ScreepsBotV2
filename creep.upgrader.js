const { getPlanData, keys } = require("./base.planningUtility");
const { pathSets, CREEP_PATHING_COST } = require("./constants");
const { updateCachedPathMatrix } = require("./extension.betterPathing");
const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const RoomInfo = require("./data.roomInfo");

class UpgraderManager extends CreepManager {
    /**
     * Generates an "upgrade" task for this upgrader.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @returns An upgrade task.
     */
    createTask(creep, roomInfo) {
        const actionStack = [];
        actionStack.push(function (creep, data) {
            const target = Game.getObjectById(data.controllerID);

            // Find our upgrader container
            const upContPos = getPlanData(
                target.room.name,
                keys.upgraderContainerPos
            );
            const upgraderContainerPos = new RoomPosition(
                upContPos.x,
                upContPos.y,
                target.room.name
            );

            // We're within range of our container already!
            const otherUpgrader = creep.room.lookForAt(
                LOOK_CREEPS,
                upgraderContainerPos.x,
                upgraderContainerPos.y
            )[0];
            const range = otherUpgrader ? 1 : 0;
            if (creep.pos.getRangeTo(upgraderContainerPos) > range) {
                creep.betterMoveTo(upgraderContainerPos, {
                    range: range,
                    maxRooms: 1,
                });
            } else {
                // We'll mark this position to discourage creeps from walking through it
                updateCachedPathMatrix(
                    pathSets.default,
                    creep.pos,
                    CREEP_PATHING_COST
                );
            }

            // Always be upgrading when we can
            if (creep.pos.getRangeTo(creep.room.controller) <= 3) {
                creep.upgradeController(target);

                // Pickup energy if we need it
                const energyUsage =
                    creep.body.filter((p) => p.type === WORK).length *
                    UPGRADE_CONTROLLER_POWER;
                if (creep.store[RESOURCE_ENERGY] <= energyUsage) {
                    const container = creep.room
                        .lookForAt(
                            LOOK_STRUCTURES,
                            upgraderContainerPos.x,
                            upgraderContainerPos.y
                        )
                        .find((s) => s.structureType === STRUCTURE_CONTAINER);
                    if (container && container.store[RESOURCE_ENERGY]) {
                        creep.withdraw(container, RESOURCE_ENERGY);
                    } else {
                        // Request energy for ourself, if our container doesn't exist yet
                        // Orders for the container itself will be handled by the basic requester
                        roomInfo.createDropoffRequest(
                            creep.store.getFreeCapacity(),
                            RESOURCE_ENERGY,
                            [creep.id]
                        );
                    }
                }
            }
        });

        // Multiple upgraders should clump up, but not fight for the spot
        return new Task(
            { controllerID: roomInfo.room.controller.id },
            "upgrade",
            actionStack
        );
    }
}

module.exports = UpgraderManager;
