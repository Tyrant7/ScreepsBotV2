module.exports = function(creep, target) {
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
    const energy = !harvest ? 0 : harvest instanceof Source ? harvest.energy : 
                                harvest instanceof Resource ? harvest.amount : 
                                harvest.store[RESOURCE_ENERGY];
    if (energy === 0) {
        // Containers
        let sources = creep.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0 });

        // Add dropped resources that are on containers or container sites to account for miners who don't have their containers built yet and overflows
        sources.push(...creep.room.find(FIND_DROPPED_RESOURCES, { 
            filter: (r) => r.resourceType === RESOURCE_ENERGY 
            && (r.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER)
            || r.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER)) }));

        // We can allow ourselves to target planted haulers
        sources.push(...creep.room.find(FIND_MY_CREEPS, { 
            filter: (c) => c.memory.role === CONSTANTS.roles.hauler && c.memory.openPull && c.memory.planted
        }));

        // Storage
        if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
            sources.push(creep.room.storage);
        }
        
        // We don't have any containers or storage yet, mine our own energy
        if (!sources || !sources.length) {
            sources = creep.room.find(FIND_SOURCES, { filter: (s) => s.energy > 0 });
        }

        // Still nothing, let's just wait
        if (!sources || !sources.length) {
            return false;
        }

        // Find the best target -> measured by a blend of distance and energy amount
        const best = sources.reduce(function(best, curr) {
            const bEnergy = best instanceof Source ? best.energy : best instanceof Resource ? best.amount : best.store[RESOURCE_ENERGY];
            const cEnergy = curr instanceof Source ? curr.energy : curr instanceof Resource ? best.amount : curr.store[RESOURCE_ENERGY];
            // Every 25 energy in a container counts as 1 distance closer when prioritising
            const bScore = creep.pos.getRangeTo(best) - (bEnergy / 25);
            const cScore = creep.pos.getRangeTo(curr) - (cEnergy / 25);
            return bScore > cScore ? curr : best;
        });
        creep.memory.harvestTarget = best.id;
        harvest = Game.getObjectById(creep.memory.harvestTarget);
    }

    // Determine if it's worth gathering ->
    // If we're above a baseline energy threshold and are closer to our target than our refill with a margin, 
    // skip refilling and go directly to our target instead
    const optionalRefillThreshold = 50;
    const refillDistanceThreshold = 2;
    if (creep.store[RESOURCE_ENERGY] >= optionalRefillThreshold &&
        creep.pos.getRangeTo(target) <= creep.pos.getRangeTo(harvest) + refillDistanceThreshold) {
        return true;
    }
    else if (creep.store[RESOURCE_ENERGY] > 0 && creep.pos.getRangeTo(harvest) > 1) {
        // Creep is going to refill, might as well use any remaining energy to repair roads
        const roads = creep.pos.lookFor(LOOK_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_ROAD });
        if (roads && roads[0]) {
            creep.repair(roads[0]);
        }
    }

    // Look for straggling energy around us to pickup
    const p = creep.pos;
    if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
        const nearby = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).find((item) => 
            (item.type === LOOK_RESOURCES && item.resource.resourceType === RESOURCE_ENERGY) 
        || (item.type === LOOK_TOMBSTONES && item.tombstone.store[RESOURCE_ENERGY] > 0) 
        || (item.type === LOOK_RUINS && item.ruin.store[RESOURCE_ENERGY] > 0)
        // We're free to take energy off of haulers if they aren't doing anything super important
        || (item.type === LOOK_CREEPS && item.creep.memory && item.creep.memory.openPull));

        // Let's pick something up
        if (nearby) {
            harvest = nearby[nearby.type];
        }
    }

    // Determine what type of intent to use to gather this energy
    let intentResult;
    if (harvest instanceof Source) {
        intentResult = creep.harvest(harvest);
    }
    else if (harvest instanceof Resource) {
        intentResult = creep.pickup(harvest);
    }
    else if (harvest instanceof Creep) {
        // Ask the openPull creep to give us some energy
        intentResult = harvest.transfer(creep, RESOURCE_ENERGY);
    }
    else {
        intentResult = creep.withdraw(harvest, RESOURCE_ENERGY);
    }

    // Move if too far away
    if (intentResult === ERR_NOT_IN_RANGE) {
        creep.moveTo(harvest);
    }
    return false;
}