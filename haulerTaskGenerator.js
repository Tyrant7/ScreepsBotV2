const Task = require("task");

// Function to convert room name to coords taken from Screeps Engine
function roomNameToXY(name) {
    let xx = parseInt(name.substr(1), 10);
    let verticalPos = 2;
    if (xx >= 100) {
        verticalPos = 4;
    } else if (xx >= 10) {
        verticalPos = 3;
    }
    let yy = parseInt(name.substr(verticalPos + 1), 10);
    let horizontalDir = name.charAt(0);
    let verticalDir = name.charAt(verticalPos);
    if (horizontalDir === 'W' || horizontalDir === 'w') {
        xx = -xx - 1;
    }
    if (verticalDir === 'N' || verticalDir === 'n') {
        yy = -yy - 1;
    }
    return [xx, yy];
};

// Range can't easily be calculated between rooms, unfortunately, so we'll just estimate
function estimateTravelTime(creep, pos) {
    const creepRoomPos = roomNameToXY(creep.pos.roomName);
    const posRoomPos = roomNameToXY(pos.roomName);
    const diffX = (Math.abs(creepRoomPos[0] - posRoomPos[0]) * 50) - 25;
    const diffY = (Math.abs(creepRoomPos[1] - posRoomPos[1]) * 50) - 25;
    return Math.max(diffX, diffY);
}

class HaulerTaskGenerator {

    run(creep, roomInfo, activeTasks) {

        // Generate some tasks for haulers
        // Tasks are quite simple: pickup and dropoff

        if (creep.store[RESOURCE_ENERGY]) {
            return this.dropoffTaskLogistics(creep, roomInfo, activeTasks);
        }
        return this.pickupTaskLogistics(creep, roomInfo, activeTasks);
    }

    pickupTaskLogistics(creep, roomInfo, activeTasks) {

        // Persist through global resets
        if (creep.memory.reservedPickup) {
            return this.generatePickupTask(creep, creep.memory.reservedPickup);
        }

        /*
        Let's sort each point by some priority amount.
        For now, priority will be calculated using a simple formula of:

            p = energy + (fillrate * Math.max(ticksUntilIGetThere - ticksUntilBeginFilling, 0))
        
        Where fillrate is defined as the speed at which the container gains energy.
        MiningSites have a positive fillrate, and dropped energy has a negative fillrate since it decays.
        */

        // Factor in the amount we've already reserved from each pickup point
        const pickupPoints = roomInfo.getEnergyPickupPoints();
        pickupPoints.forEach((point) => {
            const amountReserved = activeTasks.reduce((total, task) => {
                if (task.tag !== "pickup") {
                    return total;
                }
                return total + (task.data.id === point.id ? task.data.amount : 0);
            }, 0);
            point.amount -= amountReserved;
        });

        function getPriority(point) {
            const myDistance = creep.pos.roomName === point.pos.roomName
                ? creep.pos.getRangeTo(point.pos)
                : estimateTravelTime(creep, point.pos);

            return point.amount + (point.fillrate * Math.max(myDistance - point.ticksUntilBeginFilling, 0));
        }

        pickupPoints.sort((a, b) => {
            return getPriority(b) - getPriority(a);
        });

        // Generate pickup task with our highest priority pickup
        return this.generatePickupTask(creep, pickupPoints[0]);
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
                creep.moveTo(pickupObject);
            }
            return false;
        }];

        creep.memory.reservedPickup = reserved;
        return new Task(reserved, "pickup", actionStack);
    }

    dropoffTaskLogistics(creep, roomInfo, activeTasks) {
        
        // Persist through global resets
        if (creep.memory.reservedDropoff) {
            return this.generateDropoffTask(creep, creep.memory.reservedDropoff);
        }

        // Filter out points that can't take anymore energy
        const dropoffPoints = roomInfo.getEnergyDropoffPoints().filter((point) => {
            const structure = Game.getObjectById(point.id);
            return structure && structure.store.getFreeCapacity(RESOURCE_ENERGY);
        });

        // Lower the value of already reserved dropoff points 
        dropoffPoints.forEach((point) => {
            const amountReserved = activeTasks.reduce((total, task) => {
                if (task.tag !== "dropoff") {
                    return total;
                }
                return total + (task.data.id === point.id ? task.data.amount : 0);
            }, 0);
            point.amount -= amountReserved;
        });

        // If we don't have any points, just wait for one to open up
        if (dropoffPoints.length === 0) {
            return null;
        }

        // Sort all of our dropoff points by priority
        function getPriority(point) {

            // Priority is very rough for dropoff tasks
            const structureType = Game.getObjectById(point.id).structureType;
            if (structureType === STRUCTURE_EXTENSION ||
                structureType === STRUCTURE_SPAWN) {
                return 10000 - creep.pos.getRangeTo(point.pos);
            }
            else if (structureType === STRUCTURE_TOWER) {
                return 5000 - creep.pos.getRangeTo(point.pos);
            }
            else if (structureType === STRUCTURE_CONTAINER) {
                return 1000 - creep.pos.getRangeTo(point.pos);
            }
            else if (structureType === STRUCTURE_STORAGE) {
                return -1000 - creep.pos.getRangeTo(point.pos);
            }
            return 0;
        }
        dropoffPoints.sort((a, b) => {
            return getPriority(b) - getPriority(a);
        });

        // Generate a task for our highest priority dropoff point
        return this.generateDropoffTask(creep, dropoffPoints[0]);
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
                creep.moveTo(target);
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
}

module.exports = HaulerTaskGenerator;