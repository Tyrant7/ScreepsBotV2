class UsageSpawnHandler {

}

module.exports = UsageSpawnHandler;

// Builder
getNextSpawn(roomInfo) {

    // Don't allow us to exceed a hard max of builders
    if (roomInfo.builders.length >= CONSTANTS.maxBuilderCount) {
        return;
    }

    // First figure out how much energy it will take to build our desired structures
    const energyForThisRoom = roomInfo.constructionSites.reduce((total, curr) => {
        return total + (curr.progressTotal - curr.progress);
    }, 0);
    const energyForRemotes = roomInfo.getConstructionQueue().reduce((total, curr) => {
        return total + CONSTRUCTION_COST[curr.type];
    }, 0);

    // Limit energy for this room to what's in our storage to prevent massive overspawning
    const totalForThisRoom = roomInfo.storage 
        ? Math.min(roomInfo.storage.store[RESOURCE_ENERGY], energyForThisRoom)
        : energyForThisRoom;

    // Figure out how much WORK we already have
    const existingWork = roomInfo.builders.reduce((total, curr) => {
        return total + curr.body.filter((p) => p.type === WORK).length;
    }, 0);

    // Finally, let's allocate an arbitrary amount of WORK using this formula
    // N WORK = Math.ceil(totalEnergyToBuild / 1000)
    const wantedWork = Math.max(Math.ceil((totalForThisRoom + energyForRemotes) / 1000) - existingWork, 0);
    if (wantedWork > 0) {
        return this.make(wantedWork, roomInfo.room.energyCapacityAvailable);
    }
}


// Defender
getNextSpawn(roomInfo) {
        
    const enemies = roomInfo.getEnemies();
    if (enemies.length > roomInfo.defenders.length) {

        // Find our strongest enemy
        const mostFightParts = enemies.reduce((strongest, curr) => {
            const fightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL).length;
            return fightParts > strongest ? fightParts : strongest;
        }, 0);

        // Make an appropriately sized defender
        return this.makeMiniDefender(Math.ceil(mostFightParts / 4), roomInfo.room.energyCapacityAvailable);
    } 
}

// Repairer
getNextSpawn(roomInfo) {
    if (roomInfo.repairers.length) {
        return;
    }

    // Look for any structure below its repair threshold
    const repairStructure = roomInfo.getWantedStructures().find((s) => {
        const threshold = repairThresholds[s.structureType] || 1;
        return s.hits / s.hitsMax <= threshold;
    });
    if (repairStructure) {
        return this.make(CONSTANTS.maxRepairerLevel, roomInfo.room.energyCapacityAvailable);
    }
}

// Don't be too concerned unless these structures get extra low since they decay naturally
const repairThresholds = {
    [STRUCTURE_WALL]: 0.002,
    [STRUCTURE_RAMPART]: 0.005,
    [STRUCTURE_CONTAINER]: 0.5,
    [STRUCTURE_ROAD]: 0.5
};


// Scout
getNextSpawn(roomInfo) {
    // Don't need more than one scout per room
    if (roomInfo.scouts.length) {
        return;
    }

    // No scouts if we can't have proper remotes
    if (!roomInfo.room.storage) {
        return;
    }
    return this.make();
}


// Upgrader
getNextSpawn(roomInfo) {
    // Upgrader won't be able to do much without their container
    if (!roomInfo.getUpgraderContainer()) {
        return;
    }

    if (creepSpawnUtility.getPredictiveCreeps(roomInfo.upgraders).length === 0) {
        return this.make(roomInfo.room.energyCapacityAvailable);
    }
}