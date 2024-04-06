const CreepManager = require("./creepManager");
const Task = require("./task");
const estimateTravelTime = require("./estimateTravelTime");

class HaulerManager extends CreepManager {

    createTask(creep, roomInfo) {

        // Return an appropriate task for the creep
        if (creep.store.getUsedCapacity()) {

            // For dropoff tasks, let's ensure that we're in the base before attempting 
            // to grab a target to avoid many pathfinding calls
            if (creep.room.name !== roomInfo.room.name) {
                return this.createReturnTask(creep, roomInfo);
            }

            return this.dropoffTaskLogistics(creep, roomInfo);
        }
        return this.pickupTaskLogistics(creep, roomInfo);
    }

    createReturnTask(creep, roomInfo) {
        const actionStack = [this.basicActions.moveToRoom];
        return new Task({ roomName: roomInfo.room.name }, "return", actionStack);
    }

    dropoffTaskLogistics(creep, roomInfo) {

        // Get an array of our valid dropoff points
        const resourceType = Object.keys(creep.store)[0];
        const validDropoffs = roomInfo.getDropoffRequests(resourceType);

        // Create a goal for each dropoff point
        // Multiple goals will be created for points with multiple dropoff locations
        let goals = [];
        for (const dropoff of validDropoffs) {

            // Don't bother trying to trim down if we don't have enough haulers yet
            if (dropoff.hasEnough) {

                // Since path length is always <= range, there is no point to searching for targets whose 
                // haulers already have shorter paths than our range
                const closestDropPos = dropoff.dropoffIDs.reduce((closest, curr) => {
                    return creep.getRangeTo(Game.getObjectById(curr).pos) < creep.getRangeTo(Game.getObjectById(closest).pos)
                        ? curr
                        : closest;
                }, dropoff.dropoffIDs[0]).pos;

                // Get the first hauler that's closer to its dropoff point than us
                const furtherHauler = dropoff.assignedHaulers.find((id) => {
                    const hauler = Game.getObjectById(id);
                    return hauler && hauler.getPathLength() > creep.pos.getRangeTo(closestDropPos);
                });

                // All haulers are closer than us, so there's no point in trying this target
                if (!furtherHauler) {
                    continue;
                }
            }

            // Create goals for all dropoff targets with no haulers or at least one hauler further than us
            for (const id of dropoff.dropoffIDs) {
                goals.push({
                    pos: Game.getObjectById(id).pos,
                    dropoff: dropoff,
                });
            }
        }

        function acceptOrder(dropoff, pos, path) {
            dropoff.assignedHaulers.push(creep.id);
            creep.injectPath(path, pos);

            // Let's construct the object we want to store in memory
            // We only care about the dropoff point we selected, plus the amount and resourceType
            const reserved = {
                amount: dropoff.amount,
                resourceType: dropoff.resourceType,
                id: dropoff.dropoffIDs.find((id) => Game.getObjectById(id).pos.isEqualTo(pos)),
            };
            return createDropoffTask(creep, reserved);
        }

        while (goals.length) {
            // Let's get the closest dropoff point by path
            const closestDropoffAndPath = creep.betterFindClosestByPath(validDropoffs);
            if (!closestDropoffAndPath) {
                creep.say("No drop");
                console.log("No dropoff request found for creep " + creep.name);
                return null;
            }
            
            // If there aren't enough haulers assigned to this request, let's skip trying to steal it
            const closestDropoff = closestDropoffAndPath.goal.dropoff;
            if (!dropoff.hasEnough) {
                // We're clear -> let's accept the order and start on our path
                return acceptOrder(closestDropoff, closestDropoff.goal.pos, closestDropoffAndPath.path);
            }

            for (const assignedID of closestDropoff.assignedHaulers) {
                // Let's try to steal this order from other assigned haulers if we're closer by path length
                // For simplicity, we'll assume all haulers to be the same size
                const assignedHauler = Game.getObjectById(assignedID);
                if (!assignedHauler || !assignedHauler.hasShorterPath(path)) {
                    // Steal the order
                    const newTask = acceptOrder(closestDropoff, closestDropoff.goal.pos, closestDropoffAndPath.path);

                    // Give a new task recursively for the other hauler
                    delete assignedHauler.memory.dropoff;
                    this.createTask(assignedHauler, roomInfo);
                    return newTask;
                }
            }

            // If we couldn't steal, let's remove this goal and try again
            goals = goals.filter((goal) => goal !== closestDropoffAndPath.goal);
        }
    }

    createDropoffTask(creep, reserved) {
        const actionStack = [function(creep, dropoff) {
            const target = Game.getObjectById(dropoff.id);
            if (!target || !target.store.getFreeCapacity(dropoff.resourceType)) {
                delete creep.memory.dropoff;
                return true;
            }

            // Transfer if within range
            if (creep.pos.getRangeTo(target) <= 1) {
                if (creep.transfer(target, dropoff.resourceType) === OK) {
                    delete creep.memory.dropoff;
                    return true;
                }
            }
            // Otherwise, move
            else {
                creep.moveTo(target, {
                    pathSet: CONSTANTS.pathSets.remote,
                });
            }
            return false;
        }];

        creep.memory.dropoff = reserved;
        return new Task(reserved, "dropoff", actionStack);
    }

    pickupTaskLogistics(creep, roomInfo) {

        // Get an array of our valid pickup points
        const validPickups = roomInfo.getPickupRequests(creep);

        // Same idea as dropoff points, except each pickup only has only location 
        // and it's built-in to the object already
        let goals = validPickups.filter((pickup) => {

            // Don't bother trying to filter if this pickup doesn't have enough haulers yet
            if (!pickup.hasEnough) {
                return true;
            }

            // Filter using the same range technique
            return !!pickup.assignedHaulers.find((id) => {
                const hauler = Game.getObjectById(id);
                return hauler && hauler.getPathLength() > creep.pos.getRangeTo(pickup.pos);
            });
        });


        // TODO underneath //


        function acceptOrder(dropoff, pos, path) {
            dropoff.assignedHaulers.push(creep.id);
            creep.injectPath(path, pos);

            // Let's construct the object we want to store in memory
            // We only care about the dropoff point we selected, plus the amount and resourceType
            const reserved = {
                amount: dropoff.amount,
                resourceType: dropoff.resourceType,
                id: dropoff.dropoffIDs.find((id) => Game.getObjectById(id).pos.isEqualTo(pos)),
            };
            return createDropoffTask(creep, reserved);
        }

        while (goals.length) {
            // Let's get the closest dropoff point by path
            const closestDropoffAndPath = creep.betterFindClosestByPath(validDropoffs);
            if (!closestDropoffAndPath) {
                creep.say("No drop");
                console.log("No dropoff request found for creep " + creep.name);
                return null;
            }
            
            // If another hauler is already assigned to this request, let's check if we can steal it
            const closestDropoff = closestDropoffAndPath.goal.dropoff;
            if (!closestDropoff.assignedHaulers.length) {
                // We're clear -> let's accept the order and start on our path
                return acceptOrder(closestDropoff, closestDropoff.goal.pos, closestDropoffAndPath.path);
            }

            for (const assignedID of closestDropoff.assignedHaulers) {
                // Let's try to steal this order from other assigned haulers if we're closer by path length
                // For simplicity, we'll assume all haulers to be the same size
                const assignedHauler = Game.getObjectById(assignedID);
                if (!assignedHauler || !assignedHauler.hasShorterPath(path)) {
                    // Steal the order
                    const newTask = acceptOrder(closestDropoff, closestDropoff.goal.pos, closestDropoffAndPath.path);

                    // Give a new task recursively for the other hauler
                    delete assignedHauler.memory.dropoff;
                    this.createTask(assignedHauler, roomInfo);
                    return newTask;
                }
            }

            // If we couldn't steal, let's remove this goal and try again
            goals = goals.filter((goal) => goal !== closestDropoffAndPath.goal);
        }
    }

    generatePickupTask(creep, reserved) {
        const actionStack = [function(creep, reserved) {

            // Ensure our pickup point still exists and has energy to pickup
            const pickupObject = Game.getObjectById(reserved.id);
            const invalid = !pickupObject || 
                (pickupObject instanceof Resource && pickupObject.amount + pickupObject.fillrate <= 0) ||
                (pickupObject instanceof Structure && !pickupObject.store[RESOURCE_ENERGY]);
            if (invalid) {
                delete creep.memory.reservedPickup;
                return true;
            }

            // Move and pickup the current pickup point
            const intentResult = pickupObject instanceof Resource 
                ? creep.pickup(pickupObject)
                : creep.withdraw(pickupObject, RESOURCE_ENERGY);

            if (intentResult === OK) {
                delete creep.memory.reservedPickup;
                return true;
            }
            else if (intentResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(pickupObject, {
                    pathSet: CONSTANTS.pathSets.remote,
                });
            }
            return false;
        }];

        creep.memory.reservedPickup = reserved;
        return new Task(reserved, "pickup", actionStack);
    }
}

module.exports = HaulerManager;