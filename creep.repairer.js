const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");
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
            this.createRepairTask(creep, colony, creep.memory.target);
        }

        // We'll want to make sure the remote is still active by the time we get around to it
        colony.remotesNeedingRepairs = colony.remotesNeedingRepairs.filter(
            (r) => r.active
        );

        // Find the lowest health remote that isn't already being repaired
        const mostUrgent = colony.remotesNeedingRepairs
            .filter(
                (r) =>
                    !colony.repairers.find(
                        (rep) => rep.memory.target.sourceID === r.source.id
                    )
            )
            .reduce(
                (best, curr) => (curr.hits < best.hits ? curr : best),
                undefined
            );
        if (!mostUrgent) {
            creep.say("All done!");
            return;
        }
        return this.createRepairTask(creep, colony, mostUrgent);
    }

    createRepairTask(creep, colony, target) {
        const actionStack = [
            // First let's get energy from the storage
            function (creep, data) {
                if (!colony.room.storage) return true;
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
                        nearbyHauler.transfer(creep, RESOURCE_ENERGY);
                    }
                }

                // We don't want to move if we don't have any energy to ensure
                // that we don't skip any roads
                // We'll also verify that the road is close to fully repaired
                if (
                    creep.store[RESOURCE_ENERGY] &&
                    road.hitsMax - road.hits <= useRate * REPAIR_POWER
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
}

// Free any repairers repairing remotes that we drop
onRemoteDrop.subscribe((colony, remote) => {
    for (const repairer of colony.repairers) {
        if (repairer.memory.target.sourceID === remote.source.id) {
            delete repairer.memory.target;
        }
    }
});

module.exports = RepairerManager;
