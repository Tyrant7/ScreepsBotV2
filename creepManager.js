class CreepManager {
    constructor() {
        this.activeTasks = {};

        /**
         * An array of basic actions available to all creep types.
         * All basic actions should take a reference to the creep as well as some data about the task,
         * and should return a boolean as to whether or not the assigned task was completed this tick.
         */
        this.basicActions = {
            seekEnergy: function (creep, data) {
                // We're done when we can't hold anymore energy
                // -> check this at the beginning of the tick before planning any of our actions
                if (creep.store.getFreeCapacity() === 0) {
                    // Relinquish our current harvest target after completing the task
                    delete creep.memory.harvestTarget;
                    return true;
                }

                // Gets energy from the room's storage, or nearest container if one is available
                let harvest = Game.getObjectById(creep.memory.harvestTarget);

                // Determine our closest target and cache it while it's valid
                const energy = !harvest
                    ? 0
                    : harvest instanceof Source
                    ? harvest.energy
                    : harvest instanceof Resource
                    ? harvest.amount
                    : harvest.store[RESOURCE_ENERGY];
                if (energy === 0) {
                    // Containers
                    let sources = creep.room.find(FIND_STRUCTURES, {
                        filter: (s) =>
                            s.structureType === STRUCTURE_CONTAINER &&
                            s.store[RESOURCE_ENERGY] > 0,
                    });

                    // Include resource piles that are more than our inventory in size
                    sources.push(
                        ...creep.room.find(FIND_DROPPED_RESOURCES, {
                            filter: (r) =>
                                r.resourceType === RESOURCE_ENERGY &&
                                r.amount >=
                                    creep.store.getCapacity(RESOURCE_ENERGY),
                        })
                    );

                    // Storage
                    if (
                        creep.room.storage &&
                        creep.room.storage.store[RESOURCE_ENERGY] >
                            creep.store.getCapacity()
                    ) {
                        sources.push(creep.room.storage);
                    } else if (creep.room.name !== creep.memory.home) {
                        // Let's also add sources, if we can mine and we're not in our a base
                        if (creep.body.find((p) => p.type === WORK)) {
                            sources.push(
                                ...creep.room.find(FIND_SOURCES, {
                                    filter: (s) => s.energy > 0,
                                })
                            );
                        }
                    }

                    // Still nothing, let's just wait
                    if (!sources.length) {
                        return false;
                    }

                    // Find the best target
                    // -> If they have enough energy to support our full carry, we'll sort by distance
                    // -> Otherwise, sort by amount
                    const carryCapacity =
                        creep.body.filter((p) => p.type === CARRY).length *
                        CARRY_CAPACITY;
                    const best = sources.reduce(function (best, curr) {
                        const bDist = creep.pos.getRangeTo(best);
                        const cDist = creep.pos.getRangeTo(curr);
                        const bEnergy =
                            best instanceof Source
                                ? best.energy
                                : best instanceof Resource
                                ? best.amount
                                : best.store[RESOURCE_ENERGY];
                        const cEnergy =
                            curr instanceof Source
                                ? curr.energy
                                : curr instanceof Resource
                                ? best.amount
                                : curr.store[RESOURCE_ENERGY];
                        const bScore =
                            bEnergy >= carryCapacity ? 10000 - bDist : bEnergy;
                        const cScore =
                            cEnergy >= carryCapacity ? 10000 - cDist : cEnergy;
                        return cScore > bScore ? curr : best;
                    });
                    creep.memory.harvestTarget = best.id;
                    harvest = Game.getObjectById(creep.memory.harvestTarget);
                }

                if (
                    creep.store[RESOURCE_ENERGY] > 0 &&
                    creep.pos.getRangeTo(harvest) > 1
                ) {
                    // Creep is going to refill, might as well use any remaining energy to repair roads
                    const roads = creep.pos.lookFor(LOOK_STRUCTURES, {
                        filter: (s) => s.structureType === STRUCTURE_ROAD,
                    });
                    if (roads && roads[0]) {
                        creep.repair(roads[0]);
                    }
                }

                // Look for straggling energy around us to pickup
                const p = creep.pos;
                if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
                    const nearby = creep.room
                        .lookAtArea(p.y - 1, p.x - 1, p.y + 1, p.x + 1, true)
                        .find(
                            (item) =>
                                (item.type === LOOK_RESOURCES &&
                                    item.resource.resourceType ===
                                        RESOURCE_ENERGY) ||
                                (item.type === LOOK_TOMBSTONES &&
                                    item.tombstone.store[RESOURCE_ENERGY] >
                                        0) ||
                                (item.type === LOOK_RUINS &&
                                    item.ruin.store[RESOURCE_ENERGY] > 0) ||
                                // We're free to take energy off of haulers if they aren't doing anything super important
                                (item.type === LOOK_CREEPS &&
                                    item.creep.memory &&
                                    item.creep.memory.openPull)
                        );

                    // Let's pick something up
                    if (nearby) {
                        harvest = nearby[nearby.type];
                    }
                }

                // Determine what type of intent to use to gather this energy
                let intentResult;
                if (harvest instanceof Source) {
                    intentResult = creep.harvest(harvest);
                } else if (harvest instanceof Resource) {
                    intentResult = creep.pickup(harvest);
                } else if (harvest instanceof Creep) {
                    // Ask the openPull creep to give us some energy
                    intentResult = harvest.transfer(creep, RESOURCE_ENERGY);
                } else {
                    intentResult = creep.withdraw(harvest, RESOURCE_ENERGY);
                }

                // Move if too far away
                if (intentResult === ERR_NOT_IN_RANGE) {
                    creep.betterMoveTo(harvest);
                }
                return false;
            },
            moveToRoom: function (creep, data) {
                // Don't reassign when standing on an exit
                const leavingOrEntering =
                    creep.pos.x >= 49 ||
                    creep.pos.x <= 0 ||
                    creep.pos.y >= 49 ||
                    creep.pos.y <= 0;

                if (creep.room.name === data.roomName && !leavingOrEntering) {
                    return true;
                }

                const pos = new RoomPosition(25, 25, data.roomName);
                creep.betterMoveTo(pos, {
                    range: 23,
                    maxRooms: data.maxRooms ? data.maxRooms : 16,
                });
                return false;
            },
        };
    }

    /**
     * Runs the appropriate task associated with a given creep. If none exists, assigns a new one.
     * @param {Creep} creep The creep to run.
     * @param {RoomInfo} roomInfo Info for the creep's homeroom.
     */
    processCreep(creep, roomInfo) {
        // Skip spawning creeps
        if (creep.spawning) {
            return;
        }

        // Let's see if our creep has a task
        let task = this.activeTasks[creep.name];
        if (!task) {
            // No task -> let's get a new one for this creep and cache it for next time
            task = this.createTask(creep, roomInfo);
            this.activeTasks[creep.name] = task;
        }

        // Run our task
        if (task) {
            this.runTask(creep, task);
        }
    }

    /**
     * Runs a given task using a given creep.
     * @param {Creep} creep The creep to run on the given task.
     * @param {Task} task The task to run.
     */
    runTask(creep, task) {
        // Debug
        if (DEBUG.logTasks) {
            creep.memory.taskKey = task.tag;
        }

        // Check if current action is completed, if so, we can advance to the next action
        while (task.actionStack[task.actionStackPointer](creep, task.data)) {
            task.actionStackPointer++;

            // All actions were finished, so the task is complete
            if (task.actionStackPointer >= task.actionStack.length) {
                delete this.activeTasks[creep.name];
                break;
            }
        }
    }

    /**
     * Frees all responsiblities for the specified creep.
     * @param {string} name The name of the creep to cancel for.
     */
    freeCreep(name) {
        delete this.activeTasks[name];
    }

    /**
     * Creates an appropriate task for this creep.
     * @param {Creep} creep The creep to create a task for.
     * @param {RoomInfo} roomInfo The info object that owns the creep.
     * @returns {Task} A new Task object.
     */
    createTask(creep, roomInfo) {
        throw new Error("You must implement createTask()");
    }

    /**
     * Displays that this creep is idle using a 'say' intent.
     * @param {string} message An additional message to display. Limited to 6 characters.
     */
    alertIdleCreep(creep, message) {
        if (DEBUG.alertOnIdle) {
            creep.say("💤" + message);
        }
    }
}

module.exports = CreepManager;
