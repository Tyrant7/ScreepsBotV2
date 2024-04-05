const CreepManager = require("./creepManager");
const Task = require("./task");
const estimateTravelTime = require("./estimateTravelTime");

class HaulerManager extends CreepManager {

    createTask(creep, roomInfo) {

        // Return an appropriate task for the creep
        if (creep.store.getUsedCapacity()) {
            return this.dropoffTaskLogistics(creep, roomInfo);
        }
        return this.pickupTaskLogistics(creep, roomInfo);
    }

    dropoffTaskLogistics(creep, roomInfo) {

        // Get an array of our valid dropoff points
        const resourceType = Object.keys(creep.store)[0];
        const validDropoffs = roomInfo.getDropoffRequests(resourceType);

        // Give each of them a "pos" property
        validDropoffs.forEach((dropoff) => dropoff.pos = Game.getObjectById(dropoff.ownerID).pos);

        // Let's get the dropoff point by path
        const closestDropoffAndPath = creep.betterFindClosestByPath(validDropoffs);
        if (!closestDropoffAndPath) {
            creep.say("No drop");
            console.log("No dropoff request found for creep " + creep.name);
            return null;
        }

        // If another hauler is already assigned to this request, let's check if we're closer
        const dropoff = closestDropoffAndPath.goal;
        if (dropoff.assignedHauler) {
            const otherHauler = Game.getObjectById(dropoff.assignedHauler);
            // TODO //
            // Steal, accept, or keep searching
        }

        roomInfo.acceptDropoffRequest(closestDropoff.ownerID);
    }

    generateDropoffTask(creep, reserved) {
        const actionStack = [function(creep, reserved) {
            
            // Find our target
            // If we're restocking by type, find the nearest
            // Otherwise, just grab our target
            let target;
            if (reserved.restockTypes) {
                target = Game.rooms[creep.memory.home].find(FIND_STRUCTURES, { filter: (s) => {
                    return reserved.restockTypes.includes(s.structureType) &&
                           s.store.getFreeCapacity(RESOURCE_ENERGY);
                }}).reduce((closest, curr) => {
                    if (!closest) {
                        return curr;
                    }
                    return creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest;
                }, null);
            }            
            else {
                target = Game.getObjectById(reserved.id);
            }

            // Some targets might not store things, just go to them and wait
            if (target && !target.store) {
                creep.moveTo(target, {
                    pathSet: CONSTANTS.pathSets.remote,
                });
                return creep.store[RESOURCE_ENERGY] > 0;
            }
 
            if (!target || !target.store.getFreeCapacity(RESOURCE_ENERGY)) {
                delete creep.memory.reservedDropoff;
                return true;
            }

            // Move and transfer to current dropoff point
            const intentResult = creep.transfer(target, RESOURCE_ENERGY);
            if (intentResult === OK) {
                delete creep.memory.reservedDropoff;
                return true;
            }
            else if (intentResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    pathSet: CONSTANTS.pathSets.remote,
                });
            }
            return false;
        }];

        const dropoffObject = Game.getObjectById(reserved.id);
        if (dropoffObject.structureType === STRUCTURE_EXTENSION ||
            dropoffObject.structureType === STRUCTURE_SPAWN) {
            reserved.restockTypes = [STRUCTURE_EXTENSION, STRUCTURE_SPAWN];
        }

        creep.memory.reservedDropoff = reserved;
        return new Task(reserved, "dropoff", actionStack);
    }

    pickupTaskLogistics(creep, roomInfo) {

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