const Task = require("task");

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
        if (creep.memory.reservedPickups) {
            return this.generatePickupTask(creep.memory.reservedPickups);
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
            const amountReserved = activeTasks.reduce((total, curr) => {
                return total + (curr.point.id === point.id ? curr.amount : 0);
            }, 0);
            point.amount -= amountReserved;
        });

        function getPriority(point) {
            return point.amount + (point.fillrate * Math.max(myDistance - point.ticksUntilBeginFilling, 0));
        }
        pickupPoints.sort((a, b) => {
            return getPriority(b) - getPriority(a);
        });

        // Now that we have our sorted pickup points
        // Let's reserve them until we have no more carry capacity
        const reserved = [];
        let remainingCapacity = creep.body.filter((p) => p.type === CARRY).length * CARRY_CAPACITY;
        for (const point of pickupPoints) {
            const reservedAmount = Math.min(point.amount, remainingCapacity);
            reserved.push({
                point: point,
                amount: reservedAmount,
            });
            remainingCapacity -= reservedAmount;
            if (remainingCapacity <= 0) {
                break;
            }
        }
        return this.generatePickupTask(creep, reserved);
    }

    generatePickupTask(creep, reservedPickups) {
        const actionStack = [function(creep, reservedPickups) {
            if (reservedPickups.length === 0) {
                return true;
            }

            // Get the next valid pickup point
            let pickup = reservedPickups[0].point;
            let pickupObject = Game.getObjectById(pickup.id);
            while (!pickupObject || !pickupObject.store || pickupObject.store[RESOURCE_ENERGY] === 0) {
                if (reservedPickups.length === 0) {
                    return true;
                }
                pickup = reservedPickups.shift();
                pickupObject = Game.getObjectById(pickup.id);
            }
      
            // Figure out what intent type to use
            const intent = pickup instanceof Resource 
                ? creep.pickup
                : creep.withdraw;

            // Move and pickup the current pickup point
            const intentResult = intent(pickupObject);
            if (intentResult === OK) {
                reservedPickups.shift();
            }
            else if (intentResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(pickupObject);
            }

            // Update the creep's memory
            creep.memory.reservedPickups = reservedPickups;
            return false;
        }];

        creep.memory.reservedPickups = reservedPickups;
        return new Task(reservedPickups, "pickup", actionStack);
    }

    dropoffTaskLogistics(creep, roomInfo, activeTasks) {
        
        // Persist through global resets
        if (creep.memory.reservedDropoffs) {
            return this.generateDropoffTask(creep.memory.reservedDropoffs);
        }

        // Filter out points that can't take anymore energy
        const dropoffPoints = roomInfo.getEnergyDropoffPoints().filter((point) => {
            const structure = Game.getObjectById(point.id);
            return structure && structure.getFreeCapacity();
        });

        // Lower the value of already reserved dropoff points 
        dropoffPoints.forEach((point) => {
            const amountReserved = activeTasks.reduce((total, curr) => {
                return total + (curr.point.id === point.id ? curr.amount : 0);
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
                return 1000 + creep.pos.getRangeTo(point.pos);
            }
            else if (structureType === STRUCTURE_TOWER) {
                return 500 + creep.pos.getRangeTo(point.pos);
            }
            else if (structureType === STRUCTURE_CONTAINER) {
                return 100 + creep.pos.getRangeTo(point.pos);
            }
            else if (structureType === STRUCTURE_STORAGE) {
                return -1000 + creep.pos.getRangeTo(point.pos);
            }
            return 0;
        }
        dropoffPoints.sort((a, b) => {
            return getPriority(b) - getPriority(a);
        });

        // Now that we have our sorted dropoff points
        // Let's reserve them until we run out of energy to fill with
        const reserved = [];
        let remainingEnergy = creep.store[RESOURCE_ENERGY];
        for (const point of dropoffPoints) {
            const reservedAmount = Math.min(point.amount, remainingEnergy);
            reserved.push({
                point: point,
                amount: reservedAmount,
            });
            remainingEnergy -= reservedAmount;
            if (remainingEnergy <= 0) {
                break;
            }
        }
        return this.generateDropoffTask(creep, reserved);
    }

    generateDropoffTask(creep, reservedDropoffs) {
        const actionStack = [function(creep, reservedDropoffs) {
            if (reservedDropoffs.length === 0) {
                return true;
            }
            
            // Get the next valid dropoff point
            let dropoff = reservedDropoffs[0].point;
            let dropoffObject = Game.getObjectById(dropoff.id);
            while (!dropoffObject || !dropoffObject.store || dropoffObject.store.getFreeCapacity() === 0) {
                if (reservedDropoffs.length === 0) {
                    return true;
                }
                dropoff = reservedDropoffs.shift();
                dropoffObject = Game.getObjectById(dropoff.id);
            }
                 
            // Move and transfer to current dropoff point
            const intentResult = creep.transfer(dropoffObject);
            if (intentResult === OK) {
                reservedDropoffs.shift();
            }
            else if (intentResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(dropoffObject);
            }

            // Update the creep's memory
            creep.memory.reservedDropoffs = reservedDropoffs;
            return false;
        }];

        creep.memory.reservedDropoffs = reservedDropoffs;
        return new Task(reservedDropoffs, "dropoff", actionStack);
    }
}

module.exports = HaulerTaskGenerator;