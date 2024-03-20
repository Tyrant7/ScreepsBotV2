const remoteUtility = require("remoteUtility");
const creepSpawnUtility = require("creepSpawnUtility");
const creepMaker = require("creepMakerUsage");

class UsageSpawnHandler {
    
    getNextSpawn(roomInfo) {

        // Get our best spawn
        const spawn = this.getFirstSpawn(roomInfo, this.getExistingSpawns(roomInfo));
        if (spawn) {
            return spawn;
        }

        // Otherwise, no spawns needed
        return null;
    }

    getFirstSpawn(roomInfo, existingSpawns) {

        // TODO //
        // TEMPLATE CODE; TAKEN FROM OTHER SCRIPT AND NOT YET FUNCTIONAL //
        // PLEASE REPLACE //

        function checkIfSpawn() {
            if (wantedMiners > existingSpawns.miners) {
                return creepMaker.makeMiner(roomInfo.room.energyCapacityAvailable);
            }
            if (wantedReservers > existingSpawns.reservers) {
                return creepMaker.makeReserver();
            }
            
            // Since haulers are handled by part count and level, let's first check to see if this
            // room is requesting more or as many haulers as we already have
            // If it's more, we can add another of appropriate level
            // If it's the same, we'll add another if we don't have it yet, effectively restructuring our hauler configuration
            // e.x. 8C + 4C; 4C dies -> add a 12C; 8C dies -> do nothing since we now have our ideal level configuration
            if (wantedCarry >= existingSpawns.haulerCarry) {
                const idealHaulerLevels = this.getIdealLevels(Math.ceil(wantedCarry / 2), 
                    CONSTANTS.maxHaulerLevel, 
                    creepMaker.haulerLevelCost, 
                    roomInfo.room.energyCapacityAvailable);
                const missingHaulerLevel = this.getMissingLevel(idealHaulerLevels, existingSpawns.haulers);
                if (missingHaulerLevel) {
                    return creepMaker.makeHauler();
                }
            }
        }

        // Main room first
        let wantedMiners = roomInfo.getSources().length;
        let wantedReservers = 0;
        let wantedCarry = roomInfo.getMaxIncome();
        const nextSpawn = checkIfSpawn();
        if (nextSpawn) {
            return nextSpawn;
        }

        // Iterate over each remote until we find one that hasn't had its need met yet
        const remotes = remoteUtility.getRemotePlans(roomInfo.room.name);
        for (const remoteRoom in remotes) {
            const remote = remotes[remoteRoom];
            if (!remote.active) {
                continue;
            }

            wantedMiners += remote.sourceCount;
            wantedCarry += remote.neededCarry;
            wantedReservers += 1;

            // If we're missing anything, let's get to spawning
            const nextSpawn = checkIfSpawn();
            if (nextSpawn) {
                return nextSpawn;
            }
        }
    }

    /**
     * Determines the existing spawn counts for creeps owned by this room.
     * @param {RoomInfo} roomInfo The info object for the room to count spawns for.
     * @returns {{}} An object mapping roles to either creep count or an array existing levels, depending on creep type.
     */
    getExistingSpawns(roomInfo) {

        // Track our existing spawns
        // Same deal as tracking ideal spawns, but this time for creeps that already exist
        const existingSpawns = {
            miners: 0,
            reservers: 0,
            haulerCarry: 0,
            haulers: [],
        };

        existingSpawns.miners = roomInfo.miners.length;
        existingSpawns.reservers = roomInfo.reservers.length;

        // We'll have to do something slightly different for haulers that are measured by part counts
        haulerCarry = roomInfo.haulers.reduce((total, hauler) => {
            return total + hauler.body.filter((p) => p.type === CARRY);
        }, 0);
        existingSpawns.haulers = this.getLevels(roomInfo.haulers, function(hauler) {
            return hauler.body.filter((p) => p.type === MOVE).length;
        });

        return existingSpawns;
    }
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