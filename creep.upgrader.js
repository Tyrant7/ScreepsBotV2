const { getPlanData, keys } = require("./base.planningUtility");
const { markWorkingPosition } = require("./extension.betterPathing");
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
            const upgraderContainer = upgraderContainerPos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER);

            if (creep.pos.getRangeTo(creep.room.controller) > 3) {
                creep.betterMoveTo(creep.room.controller.pos, {
                    range: 3,
                    maxRooms: 1,
                });
                return;
            }

            // We'll encourage ourselves to not stand on roads
            if (
                creep.pos
                    .lookFor(LOOK_STRUCTURES)
                    .filter((s) => s.structureType === STRUCTURE_ROAD)[0]
            ) {
                creep.betterMoveTo(creep.room.controller.pos, {
                    range: 1,
                    maxRooms: 1,
                });
            }

            // Always be upgrading when we can
            creep.upgradeController(target);

            // We'll mark this position to discourage creeps from walking through it
            markWorkingPosition(creep.pos);

            // If we have a container, we'll walk next to it if we're getting low on energy
            if (upgraderContainer) {
                if (!upgraderContainer.store[RESOURCE_ENERGY]) {
                    return;
                }

                const dist = creep.pos.getRangeTo(
                    upgraderContainerPos.x,
                    upgraderContainerPos.y
                );
                if (
                    creep.store[RESOURCE_ENERGY] <=
                    (dist * data.energyUsage) / data.moveSpeed
                ) {
                    if (dist <= 1) {
                        creep.withdraw(upgraderContainer, RESOURCE_ENERGY);
                    } else {
                        creep.betterMoveTo(upgraderContainerPos, {
                            range: 1,
                            maxRooms: 1,
                        });
                    }
                }
                return;
            }
            if (creep.store[RESOURCE_ENERGY] <= data.energyUsage * 2) {
                // Otherwise, we don't need to move, we'll simply request
                // energy for ourself from haulers, if our container doesn't exist yet
                // Orders for the container itself will be handled by the basic requester
                roomInfo.createDropoffRequest(
                    creep.store.getFreeCapacity(),
                    RESOURCE_ENERGY,
                    [creep.id]
                );
            }
        });

        // Multiple upgraders should clump up, but not fight for the spot
        const energyUsage =
            creep.body.filter((p) => p.type === WORK).length *
            UPGRADE_CONTROLLER_POWER;
        const moveSpeed =
            creep.body.filter((p) => p.type === MOVE).length /
            creep.body.filter((p) => p.type !== MOVE && p.type !== CARRY)
                .length;
        return new Task(
            {
                controllerID: roomInfo.room.controller.id,
                energyUsage,
                moveSpeed,
            },
            "upgrade",
            actionStack
        );
    }
}

module.exports = UpgraderManager;
