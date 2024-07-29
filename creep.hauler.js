const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const estimateTravelTime = require("./util.estimateTravelTime");
const { pathSets } = require("./constants");

class HaulerManager extends CreepManager {
    createTask(creep, colony) {
        if (creep.memory.dropoff) {
            return this.createDropoffTask(colony, creep, creep.memory.dropoff);
        } else if (creep.memory.pickup) {
            return this.createPickupTask(colony, creep, creep.memory.pickup);
        }

        // Return an appropriate task for the creep
        if (creep.store.getUsedCapacity()) {
            // For dropoff tasks, let's ensure that we're in the base before attempting
            // to grab a target to avoid many pathfinding calls
            if (creep.room.name !== colony.room.name) {
                return this.createReturnTask(creep, colony);
            }
            return this.dropoffTaskLogistics(creep, colony);
        }
        return this.pickupTaskLogistics(creep, colony);
    }

    createReturnTask(creep, colony) {
        const actionStack = [
            this.basicActions.moveToRoom,
            function (creep, data) {
                delete creep.memory.returning;
                return true;
            },
        ];
        creep.memory.returning = true;
        return new Task({ roomName: colony.room.name }, "return", actionStack);
    }

    dropoffTaskLogistics(creep, colony) {
        // Get an array of our valid dropoff points
        const resourceType = Object.keys(creep.store)[0];
        const validDropoffs = colony.getDropoffRequests(resourceType);

        // Create a goal for each dropoff point
        // Multiple goals will be created for points with multiple dropoff locations
        let goals = [];
        for (const dropoff of validDropoffs) {
            // Don't bother trying to trim down if we don't have enough haulers yet
            if (dropoff.hasEnough) {
                // Since path length is always <= range, there is no point to searching for targets whose
                // haulers already have shorter paths than our range
                const closestDropID =
                    dropoff.dropoffIDs.length > 1
                        ? dropoff.dropoffIDs.reduce((closest, curr) => {
                              return creep.pos.getRangeTo(
                                  Game.getObjectById(curr).pos
                              ) <
                                  creep.pos.getRangeTo(
                                      Game.getObjectById(closest).pos
                                  )
                                  ? curr
                                  : closest;
                          }).pos
                        : dropoff.dropoffIDs[0];
                const closestDropPos = Game.getObjectById(closestDropID).pos;

                // Get the first hauler that's further from its dropoff point than us
                const furtherHauler = dropoff.assignedHaulers.find((id) => {
                    return (
                        Game.getObjectById(id).getPathLength() >
                        estimateTravelTime(creep.pos, closestDropPos)
                    );
                });

                // All haulers are closer than us, so there's no point in trying this target
                if (!furtherHauler) {
                    continue;
                }
            }

            // Create goals for all dropoff targets with no haulers or at least one hauler further than us
            for (const id of dropoff.dropoffIDs) {
                goals.push({ pos: Game.getObjectById(id).pos, range: 1 });
            }
        }

        while (goals.length) {
            // Let's get the closest dropoff point by path
            const closestGoalAndPath = creep.betterFindClosestByPath(goals, {
                pathSet: pathSets.default,
            });

            // No good jobs for this creep
            if (!closestGoalAndPath) {
                break;
            }

            // If there aren't enough haulers assigned to this request, let's skip trying to steal it
            const closestDropoff = validDropoffs.find((dropoff) =>
                dropoff.dropoffIDs.find((id) =>
                    Game.getObjectById(id).pos.isEqualTo(
                        closestGoalAndPath.goal
                    )
                )
            );
            if (!closestDropoff.hasEnough) {
                // We're clear -> let's accept the order and start on our path
                const orderInfo = acceptOrder(
                    closestDropoff,
                    closestGoalAndPath.goal,
                    closestGoalAndPath.path
                );

                console.log(
                    creep.name + " accepting order " + closestDropoff.requestID
                );

                return this.createDropoffTask(colony, creep, orderInfo);
            }

            for (const assignedID of closestDropoff.assignedHaulers) {
                // Let's try to steal this order from other assigned haulers if we're closer by path length
                // For simplicity, we'll assume all haulers to be the same size
                const assignedHauler = Game.getObjectById(assignedID);
                if (!assignedHauler.hasShorterPath(closestGoalAndPath.path)) {
                    // Steal the order
                    const orderInfo = acceptOrder(
                        closestDropoff,
                        closestGoalAndPath.goal,
                        closestGoalAndPath.path
                    );

                    // Give a new task recursively for the other hauler
                    colony.unassignDropoff(
                        closestDropoff.requestID,
                        assignedHauler.id
                    );
                    delete assignedHauler.memory.dropoff;

                    console.log(
                        creep.name +
                            " stealing order " +
                            closestDropoff.requestID +
                            " from " +
                            assignedHauler.name
                    );

                    // We need to create the task first to store the dropoff in our memory to ensure the other
                    // hauler doesn't unknowingly steal it back
                    const task = this.createDropoffTask(
                        colony,
                        creep,
                        orderInfo
                    );
                    this.createTask(assignedHauler, colony);
                    return task;
                }
            }

            // If we couldn't steal, let's remove this goal and try again
            goals = goals.filter((goal) => goal !== closestGoalAndPath.goal);
        }

        // Didn't find a valid order -> alert us
        this.alertIdleCreep(creep, "D");

        function acceptOrder(dropoff, pos, path) {
            creep.injectPath(path, pos);

            // Let's construct the object we want to store in memory
            // We only care about the dropoff ID we selected, plus the type and amount
            // And a key for us to relink this hauler to this request in case of a global reset
            return {
                amount: dropoff.amount,
                resourceType: dropoff.resourceType,
                id: dropoff.dropoffIDs.find((id) =>
                    Game.getObjectById(id).pos.isEqualTo(pos)
                ),
                hash: dropoff.requestID,
            };
        }
    }

    createDropoffTask(colony, creep, reserved) {
        const actionStack = [
            function (creep, dropoff) {
                // Our task was stolen, and replacement failed
                // -> idle until a new task is found to prevent duplicating the stolen task
                if (!creep.memory.dropoff) {
                    return true;
                }

                const target = Game.getObjectById(dropoff.id);
                if (
                    !target ||
                    !target.store.getFreeCapacity(dropoff.resourceType) ||
                    !creep.store[dropoff.resourceType]
                ) {
                    return true;
                }

                // Transfer if within range
                if (creep.pos.getRangeTo(target) <= 1) {
                    creep.transfer(target, dropoff.resourceType);
                }
                // Otherwise, move
                else {
                    creep.betterMoveTo(target, {
                        pathSet: pathSets.default,
                    });
                }
                return false;
            },
            function (creep, dropoff) {
                delete creep.memory.dropoff;
                return true;
            },
        ];

        creep.memory.dropoff = reserved;
        colony.acceptDropoffRequest(reserved.hash, creep.id);
        return new Task(reserved, "dropoff", actionStack);
    }

    pickupTaskLogistics(creep, colony) {
        // Get an array of our valid pickup points
        const validPickups = colony.getPickupRequests(creep);

        // Same idea as dropoff points, except each pickup only has only location
        // and it's built-in to the object already
        let goals = [];
        for (const pickup of validPickups) {
            // Only try to filter if this pickup has enough haulers
            if (pickup.hasEnough) {
                const furtherHauler = pickup.assignedHaulers.find((id) => {
                    return (
                        Game.getObjectById(id).getPathLength() >
                        estimateTravelTime(creep.pos, pickup.pos)
                    );
                });

                // All haulers are closer than us, so there's no point in trying this target
                if (!furtherHauler) {
                    continue;
                }
            }
            goals.push({ pos: pickup.pos, range: 1 });
        }

        while (goals.length) {
            // Path to closest goal
            const closestPickupAndPath = creep.betterFindClosestByPath(goals, {
                pathSet: pathSets.default,
            });

            // No good jobs for this creep
            if (!closestPickupAndPath) {
                break;
            }

            // If there aren't enough haulers assigned to this request, let's skip trying to steal it
            const closestPickup = validPickups.find((pickup) =>
                pickup.pos.isEqualTo(closestPickupAndPath.goal)
            );
            if (!closestPickup.hasEnough) {
                const orderInfo = acceptOrder(
                    closestPickup,
                    closestPickupAndPath.path
                );
                return this.createPickupTask(colony, creep, orderInfo);
            }

            for (const assignedID of closestPickup.assignedHaulers) {
                // Let's try to steal this order from other assigned haulers if we're closer by path length
                // For simplicity, we'll assume all haulers to be the same size
                const assignedHauler = Game.getObjectById(assignedID);
                if (!assignedHauler.hasShorterPath(closestPickupAndPath.path)) {
                    // Steal the order
                    const orderInfo = acceptOrder(
                        closestPickup,
                        closestPickupAndPath.path
                    );

                    // Give a new task recursively for the other hauler, and remove it from
                    // the current request so that no other haulers try to steal this task again from
                    // this same hauler on the same tick that we did
                    colony.unassignPickup(
                        closestPickup.requestID,
                        assignedHauler.id
                    );
                    delete assignedHauler.memory.pickup;

                    // We need to create the task first to store the dropoff in our memory to ensure the other
                    // hauler doesn't unknowingly steal it back
                    const task = this.createPickupTask(
                        colony,
                        creep,
                        orderInfo
                    );
                    this.createTask(assignedHauler, colony);
                    return task;
                }
            }

            // If we couldn't steal, let's remove this goal and try again
            goals = goals.filter((goal) => goal !== closestPickupAndPath.goal);
        }

        // Didn't find a valid order -> alert us
        this.alertIdleCreep(creep, "P");

        function acceptOrder(pickup, path) {
            creep.injectPath(path, pickup.pos);

            // Let's construct the object we want to store in memory
            // We only care about the pickup point, type, and amount
            return {
                amount: pickup.amount,
                resourceType: pickup.resourceType,
                pos: pickup.pos,
                hash: pickup.requestID,
            };
        }
    }

    createPickupTask(colony, creep, reserved) {
        const actionStack = [
            function (creep, pickup) {
                // Our task was stolen, and replacement failed
                // -> idle until a new task is found to prevent duplicating the stolen task
                if (!creep.memory.pickup) {
                    return true;
                }

                // Can't pickup anything else -> find a dropoff location
                if (!creep.store.getFreeCapacity()) {
                    return true;
                }

                // We won't be able to access our pickup point
                // Let's cancel the request for now
                if (!Game.rooms[pickup.pos.roomName]) {
                    return true;
                }

                // Ensure that there's still resources to pickup at our point
                const targetPos = new RoomPosition(
                    pickup.pos.x,
                    pickup.pos.y,
                    pickup.pos.roomName
                );
                const pickupsAtLocation = targetPos.look().filter((look) => {
                    return (
                        (look.structure &&
                            look[look.type].store &&
                            look[look.type].store[pickup.resourceType]) ||
                        // Filter out amounts less than some small margin to ensure that creeps don't attempt to pickup the same energy
                        (look.type === LOOK_RESOURCES &&
                            look.resource.amount > 50)
                    );
                });

                if (!pickupsAtLocation.length) {
                    return true;
                }

                // Pickup!
                if (creep.pos.getRangeTo(targetPos) <= 1) {
                    // Pickup dropped resources first
                    const dropped = pickupsAtLocation.find(
                        (p) => p.type === LOOK_RESOURCES
                    );
                    if (dropped) {
                        creep.pickup(dropped.resource);
                        return false;
                    }

                    // Then withdraw
                    const storeObject = pickupsAtLocation.find(
                        (p) => p[p.type].store[pickup.resourceType]
                    );
                    if (storeObject) {
                        creep.withdraw(
                            storeObject[storeObject.type],
                            pickup.resourceType
                        );
                        return false;
                    }

                    // Nothing left to pickup
                    return true;
                } else {
                    creep.betterMoveTo(targetPos, {
                        pathSet: pathSets.default,
                    });
                }
                return false;
            },
            function (creep, pickup) {
                delete creep.memory.pickup;
                return true;
            },
        ];

        creep.memory.pickup = reserved;
        colony.acceptPickupRequest(reserved.hash, creep.id);
        return new Task(reserved, "pickup", actionStack);
    }
}

module.exports = HaulerManager;
