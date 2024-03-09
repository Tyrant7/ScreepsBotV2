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
        /*
        Let's sort each point by some priority amount.
        For now, priority will be calculated using a simple formula of:

            p = energy + (fillrate * Math.max(ticksUntilIGetThere - ticksUntilBeginFilling, 0))
        
        Where fillrate is defined as the speed at which the container gains energy.
        MiningSites have a positive fillrate, and dropped energy has a negative fillrate since it decays.
        */

        const pickupPoints = roomInfo.getEnergyPickupPoints();
        function getPriority(point) {
            return point.amount + (point.fillrate * Math.max(myDistance - point.ticksUntilBeginFilling, 0));
        }
        pickupPoints.sort((a, b) => {
            return getPriority(b) - getPriority(a);
        });

        // Now that we have our sorted pickup points


    }

    generatePickupTask(target) {

    }

    dropoffTaskLogistics(creep, roomInfo, activeTasks) {
        
        // Filter out points that can't take anymore energy
        const dropoffPoints = roomInfo.getEnergyDropoffPoints().filter((point) => {
            const structure = Game.getObjectById(point.id);
            return structure && structure.getFreeCapacity();
        });

        // If we don't have any points, attempt to dropoff at the storage
        if (dropoffPoints.length === 0) {
            if (roomInfo.room.storage && roomInfo.room.storage.store.getFreeCapacity()) {
                return this.generateDropoffTask(roomInfo.room.storage);
            }

            // Storage doesn't exist or is full; nowhere to dropoff
            return null;
        }

        // Sort all of our dropoff points by priority
        function getPriority(point) {

            // Priority is very rough for dropoff tasks
            const structureType =  Game.getObjectById(point.id).structureType;
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
        }
        pickupPoints.sort((a, b) => {
            return getPriority(b) - getPriority(a);
        });

        // Now that we have our sorted dropoff points

        
    }

    generateDropoffTask(target) {

    }
}


const taskType = {
    deliver: "deliver",
    restock: "restock",
};

const basicActions = {
    // Delivers the creep's current inventory to target
    [taskType.deliver]: function(creep, data) {

        const deliverTarget = Game.getObjectById(data.deliverID);

        // Let workers know that this hauler is open to pull energy off of if needed
        creep.memory.openPull = true;

        // Our inventory is empty -> nothing to deliver
        if (!creep.store[RESOURCE_ENERGY]) {
            delete creep.memory.openPull;
            delete creep.memory.planted;
            return true;
        }

        if (deliverTarget.id === creep.room.controller.id) {
            if (creep.pos.getRangeTo(deliverTarget) > 2) {
                creep.moveTo(deliverTarget);
            }
            else {
                // Let other creeps know that they can target this one when harvesting
                creep.memory.planted = true;
            }
            return false;
        }
        else {
            const transferResult = creep.transfer(deliverTarget, RESOURCE_ENERGY);
            if (transferResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(deliverTarget);
            }
            else if (transferResult === OK) {
                delete creep.memory.openPull;
                return true;
            }
        }
        return false;
    },
    // Restocks an extensions or spawn in the creep's room
    [taskType.restock]: function(creep, data) {

        let target = null;
        // Restocking a particular ID takes precedence over a type of structure
        if (data.restockID) {
            target = Game.getObjectById(data.restockID);
            if (target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                return true;
            }
        }
        else {
            // Find closest structure matching the types to restock
            const restocks = creep.room.find(FIND_MY_STRUCTURES, { filter: 
                (s) => data.structureTypes.includes(s.structureType) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 
            });
            if (restocks.length === 0) {
                return true;
            }
            target = restocks.reduce(
                (closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, restocks[0]);
        }

        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0;
    },
    // Harvests from whatever target is closest in the creep's room
    "harvest_strict": function(creep, data) {
        return harvest(creep, data, true);
    },
    "harvest_loose": function(creep, data) {
        return harvest(creep, data, false);
    }
};

/**
 * Function to recycle harvesting logic for strict and loose harvesting.
 * Strict harvesting means that we must be full before continuing, non-strict harvesting means
 * that we need at least enough to fill an extension in our homeroom.
 * @param {Creep} creep The creep to run harvesting logic for.
 * @param {*} data The data object of the task.
 * @param {boolean} strict Whether or not the creep should fill up if it already has energy.
 * @returns 
 */
function harvest(creep, data, strict) {

    // We're done when we can't hold anymore energy
    // Relinquish our current harvest target and complete this task
    // -> check this at the beginning of the tick before planning any of our actions
    if (strict) {
        if (creep.store.getUsedCapacity() > creep.store.getCapacity() / 2) {
            delete creep.memory.harvestTarget;
            return true;
        }
    }
    else {
        const extCapacity = EXTENSION_ENERGY_CAPACITY[Game.rooms[creep.memory.home].controller.level];
        if (creep.store[RESOURCE_ENERGY] >= extCapacity) {
            delete creep.memory.harvestTarget;
            return true;
        }
    }

    // Gets energy from the room's storage, or nearest container if one is available
    let harvest = Game.getObjectById(creep.memory.harvestTarget);

    // Determine our closest target and cache it while it's valid
    const energy = !harvest ? 0 : harvest instanceof Resource ? harvest.amount : 
                                  harvest.store[RESOURCE_ENERGY];
    if (energy === 0) {
        // Containers, don't allow taking energy from the upgrader container
        let sources = creep.room.find(FIND_STRUCTURES, { filter: (s) => {
            const base = Memory.bases[creep.room.name];
            if (base && base.upgraderContainer && s.pos.isEqualTo(new RoomPosition(
                base.upgraderContainer.x, base.upgraderContainer.y, base.upgraderContainer.roomName
            ))) {
                return false;
            }
            return s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0;
        }});

        // Add dropped resources that are on containers or container sites to account for miners who don't have their containers built yet and overflows
        sources.push(...creep.room.find(FIND_DROPPED_RESOURCES, { 
            filter: (r) => r.resourceType === RESOURCE_ENERGY 
            && (r.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER)
            || r.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER)) }));

        // Storage
        if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
            sources.push(creep.room.storage);
        }
        
        // We've got nothing to collect from -> simply wait
        if (!sources.length) {
            return false;
        }

        // Find the best target -> measured by a blend of distance and energy amount
        const best = sources.reduce(function(best, curr) {
            const bEnergy = best instanceof Resource ? best.amount : best.store[RESOURCE_ENERGY];
            const cEnergy = curr instanceof Resource ? best.amount : curr.store[RESOURCE_ENERGY];
            // Every 25 energy in a container counts as 1 distance closer when prioritising
            const bScore = creep.pos.getRangeTo(best) - (bEnergy / 25);
            const cScore = creep.pos.getRangeTo(curr) - (cEnergy / 25);
            return bScore > cScore ? curr : best;
        });
        creep.memory.harvestTarget = best.id;
        harvest = Game.getObjectById(creep.memory.harvestTarget);
    }

    // Look for straggling energy around us to pickup
    const p = creep.pos;
    if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
        const nearby = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).find((item) => 
            (item.type === LOOK_RESOURCES && item.resource.resourceType === RESOURCE_ENERGY) 
         || (item.type === LOOK_TOMBSTONES && item.tombstone.store[RESOURCE_ENERGY] > 0) 
         || (item.type === LOOK_RUINS && item.ruin.store[RESOURCE_ENERGY] > 0))

        // Let's pick something up
        if (nearby) {
            harvest = nearby[nearby.type];
        }
    }

    // Determine what type of intent to use to gather this energy
    const intentResult = harvest instanceof Resource ? creep.pickup(harvest) 
        : creep.withdraw(harvest, RESOURCE_ENERGY);
   
    // Move if too far away
    if (intentResult === ERR_NOT_IN_RANGE) {
        creep.moveTo(harvest);
    }
    return false;
}

module.exports = HaulerTaskGenerator;