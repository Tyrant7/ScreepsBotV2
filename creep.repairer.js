const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const Colony = require("./data.colony");
const { roles, pathSets, repairThresholds } = require("./constants");
const { onRemoteDrop } = require("./event.colonyEvents");

/**
 * For the same system as builders.
 */
const REQUEST_ADVANCE_TICKS = 10;

class RepairerManager extends CreepManager {
    /**
     * Creates a new best-fitting task for this creep.
     * @param {Creep} creep The creep to create tasks for.
     * @param {Colony} colony The colony object associated with the room to generate tasks for.
     * @returns The best fitting task object for this creep.
     */
    createTask(creep, colony) {
        if (creep.memory.target) {
            return this.createRemoteRepairTask(
                creep,
                colony,
                creep.memory.target
            );
        }

        // Prioritize our base's structures over remotes
        if (colony.ownStructuresNeedingRepair.length) {
            return this.createBaseRepairTask(creep, colony);
        }

        // We'll want to make sure the remote is still active by the time we get around to it
        colony.remotesNeedingRepair = colony.remotesNeedingRepair.filter((r) =>
            colony.remotePlans.find(
                (p) => p.source.id === r.sourceID && p.active
            )
        );

        // Find the lowest health remote that isn't already being repaired
        const nextTarget = colony.remotesNeedingRepair.find(
            (r) =>
                !colony.repairers.find(
                    (rep) =>
                        rep.memory.target &&
                        rep.memory.target.sourceID === r.source.id
                )
        );
        if (!nextTarget) {
            creep.say("All done!");
            return;
        }
        return this.createRemoteRepairTask(creep, colony, nextTarget);
    }

    createRemoteRepairTask(creep, colony, target) {
        const actionStack = [
            // First let's get energy from the storage
            function (creep, data) {
                if (!colony.room.storage) {
                    const corePos = colony.room.getPositionAt(
                        colony.core.x,
                        colony.core.y
                    );
                    creep.betterMoveTo(corePos, {
                        pathSet: pathSets.default,
                        range: 3,
                    });
                    return creep.pos.getRangeTo(corePos) <= 3;
                }
                if (creep.pos.getRangeTo(colony.room.storage) <= 1) {
                    creep.withdraw(colony.room.storage, RESOURCE_ENERGY);
                    return true;
                }
                creep.betterMoveTo(colony.room.storage, {
                    pathSet: pathSets.default,
                });
            },
            // Then traverse our entire path and repair roads
            function (creep, { endPosition, useRate }) {
                // If our target is changed elsewhere, drop the task
                if (!creep.memory.target) {
                    return true;
                }

                const road = creep.pos
                    .lookFor(LOOK_STRUCTURES)
                    .find((s) => s.structureType === STRUCTURE_ROAD);
                if (road && road.hits < road.hitsMax) {
                    creep.repair(road);
                }
                if (creep.pos.getRangeTo(endPosition) <= 1) {
                    colony.remotesNeedingRepair =
                        colony.remotesNeedingRepair.filter((r) => r !== target);
                    return true;
                }

                // Request energy
                if (creep.room.name === colony.room.name) {
                    if (
                        creep.store[RESOURCE_ENERGY] <=
                        useRate * REQUEST_ADVANCE_TICKS
                    ) {
                        colony.createDropoffRequest(
                            creep.store.getCapacity(),
                            RESOURCE_ENERGY,
                            [creep.id]
                        );
                    }
                } else {
                    // We'll pull energy off of haulers traveling by for our energy source in remotes
                    const nearbyHauler = creep.room
                        .lookForAtArea(
                            LOOK_CREEPS,
                            creep.pos.x - 1,
                            creep.pos.x - 1,
                            creep.pos.y + 1,
                            creep.pos.y + 1,
                            true
                        )
                        .find(
                            (c) =>
                                c.creep.my &&
                                c.creep.memory.role === roles.hauler &&
                                c.creep.store[RESOURCE_ENERGY]
                        );
                    // If there is one nearby, let's fill up
                    if (nearbyHauler) {
                        nearbyHauler.creep.transfer(creep, RESOURCE_ENERGY);
                    }
                }

                // We don't want to move if we don't have any energy to ensure
                // that we don't skip any roads
                // We'll also verify that the road is close to fully repaired
                if (
                    !road ||
                    (creep.store[RESOURCE_ENERGY] &&
                        road.hitsMax - road.hits <= useRate * REPAIR_POWER)
                ) {
                    creep.betterMoveTo(endPosition, {
                        pathSet: pathSets.default,
                    });
                }
            },
        ];
        creep.memory.target = target;
        return new Task(
            {
                endPosition: new RoomPosition(
                    target.endPos.x,
                    target.endPos.y,
                    target.endPos.roomName
                ),
                useRate: creep.body.filter((p) => p.type === WORK).length,
            },
            "repair",
            actionStack
        );
    }

    createBaseRepairTask(creep, colony) {
        const actionStack = [
            // First let's get energy from the storage
            function (creep, data) {
                if (!colony.room.storage || creep.store[RESOURCE_ENERGY])
                    return true;
                if (creep.pos.getRangeTo(colony.room.storage) <= 1) {
                    creep.withdraw(colony.room.storage, RESOURCE_ENERGY);
                    return true;
                }
                creep.betterMoveTo(colony.room.storage, {
                    pathSet: pathSets.default,
                });
            },
            function (creep, { targetID, useRate }) {
                if (
                    creep.store[RESOURCE_ENERGY] <=
                    useRate * REQUEST_ADVANCE_TICKS
                ) {
                    colony.createDropoffRequest(
                        creep.store.getCapacity(),
                        RESOURCE_ENERGY,
                        [creep.id]
                    );
                }

                const target = Game.getObjectById(targetID);
                if (!target) return true;
                if (
                    target.hits / target.hitsMax >=
                    repairThresholds[target.structureType].max
                )
                    return true;

                if (creep.pos.getRangeTo(target) <= 3) {
                    creep.repair(target);
                    return false;
                }
                creep.betterMoveTo(target, {
                    pathSet: pathSets.default,
                });
            },
        ];

        // Find our closest target and remove it
        const closestTarget = _.min(colony.ownStructuresNeedingRepair, (s) =>
            creep.pos.getRangeTo(s.pos)
        );
        colony.ownStructuresNeedingRepair =
            colony.ownStructuresNeedingRepair.filter(
                (s) => s !== closestTarget
            );
        return new Task(
            {
                targetID: closestTarget.id,
                useRate: creep.body.filter((p) => p.type === WORK).length,
            },
            "repair",
            actionStack
        );
    }
}

// Free any repairers repairing remotes that we drop
onRemoteDrop.subscribe((colony, remote) => {
    for (const repairer of colony.repairers) {
        if (!repairer.memory.target) continue;
        if (repairer.memory.target.sourceID === remote.source.id) {
            delete repairer.memory.target;
        }
    }
});

module.exports = RepairerManager;
