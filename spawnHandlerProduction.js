const remoteUtility = require("remoteUtility");
const creepSpawnUtility = require("creepSpawnUtility");

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


class ProductionSpawnHandler {

    getNextSpawn(roomInfo) {

        // Let's start with getting our ideal spawns for this room
        const idealSpawns = this.getIdealSpawns(roomInfo);

        // Next, let's track our existing spawns to compare
        const existingSpawns = this.getExistingSpawns(roomInfo);


        // TODO //
        // FIGURE OUT WHAT ORDER TO SPAWN




        const missingLevel = this.getMissingLevel(idealHaulerLevels, realHaulerLevels);

        // Otherwise, no spawns needed
        return null;
    }

    /**
     * Determines the ideal spawns for this room and its remotes.
     * @param {RoomInfo} roomInfo The info object for the room to determine spawns for.
     * @returns {{}} An object mapping roles to either creep count or an array of ideal levels, depending on creep type.
     */
    getIdealSpawns(roomInfo) {

        // Track our ideal spawns
        // In creep count for types measured in creep count, and part count for those measured in part count
        const idealSpawns = {
            miners: 0,
            reservers: 0,
            haulers: [],
        };

        // Let's start with our main room
        // As far as producers go, it's pretty simple
        // One miner per source, and enough hauler carry to transport that
        // We're going to arbitrarily take carry parts according to max income for main room, since transport is difficult to estimate
        idealSpawns.miners = roomInfo.getSources().length;
        let totalCarry = roomInfo.getMaxIncome();

        // Now for our remotes
        const remotes = remoteUtility.getRemotePlans(roomInfo.room.name);
        for (const remoteRoom in remotes) {
            const remote = remotes[remoteRoom];
            if (!remote.active) {
                continue;
            }

            // Pretty easy as it's all precomputed
            idealSpawns.miners += remote.sourceCount;
            idealSpawns.reservers += 1;
            totalCarry += remote.neededCarry;
        }

        // For haulers we're tracking the ideal level arrangement as well, not just creep counts
        idealSpawns.haulers = this.getIdealLevels(Math.ceil(totalCarry / 2), 
            CONSTANTS.maxHaulerLevel, 
            creepMaker.haulerLevelCost, 
            roomInfo.room.energyCapacityAvailable);

        return idealSpawns;
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
            haulers: [],
        };

        existingSpawns.miners = roomInfo.miners.length;
        existingSpawns.reservers = roomInfo.reservers.length;

        // We'll have to do something slightly different for haulers that are measured by part counts
        existingSpawns.haulers = this.getLevels(roomInfo.haulers, function(hauler) {
            return hauler.body.filter((p) => p.type === MOVE).length;
        });

        return existingSpawns;
    }

    //#region Leveled Spawning

    /**
     * Determines the level of each creep in the array according to the function passed.
     * @param {Creep[]} creeps An array of creeps to determine level for.
     * @param {function(Creep): number} levelDeterminer The function that determines the level of creeps.
     * @returns {number[]} An array of creep levels.
     */
    getLevels(creeps, levelDeterminer) {

        // Map each creep to a level determined by the determiner function
        return creeps.map((creep) => {
            return levelDeterminer(creep);
        });
    }

    /**
     * Finds the ideal level arrangement of creeps given some parameters.
     * @param {number} levelTotal The total number of levels wanted.
     * @param {number} maxLevel The max level of any individual creep.
     * @param {number} levelCost The energy cost of spawning a single level.
     * @param {number} energyCapacity The energy capacity of the room that spawning will occur in.
     * @returns {number[]} An array of creep levels.
     */
    getIdealLevels(levelTotal, maxLevel, levelCost, energyCapacity) {

        // Find the biggest creep we can build in this room
        const highestLevel = Math.min(energyCapacity / levelCost, maxLevel);

        // Divide our desired level count to get our desired number of creeps
        const creepCount = Math.floor(levelTotal / highestLevel);

        // If we have leftover parts that didn't fit into a max size creep, let's make a smaller one
        const leftover = levelTotal % highestLevel;

        // Add these desired levels to the queue, pushing the leftover last
        const queue = [];
        for (let i = 0; i < creepCount; i++) {
            queue.push(highestLevel);
        }
        if (leftover > 0) {
            queue.push(leftover);
        }
        return queue;
    }

    /**
     * Finds the first level of creep that has not yet been spawned, given the ideal and existing levels.
     * @param {number[]} idealLevels The ideal level arrangement of creeps.
     * @param {number[]} realLevels The actual level arrangement of creeps.
     * @returns {number} A single number, representing the level of the first missing creep to spawn.
     */
    getMissingLevel(idealLevels, realLevels) {

        // Let's search for the first creep that we're missing
        for (const level of idealLevels) {
            // If we already have a creep of this level, let's remove it so it doesn't get detected again
            const index = realLevels.indexOf(level);
            if (index > -1) {
                realLevels.splice(index, 1);
                continue;
            }
            // Otherwise, we're missing a creep of this level
            return level;
        }
    }

    //#endregion
}

module.exports = ProductionSpawnHandler;



class RemoteSpawnHandler {

    getNextSpawn(roomInfo) {


        // Any amount of hauler parts that weren't enough to make a max level by the end of all spawns
        // should overflow here
        // We know that our remaining needed carry will be equal to -existing carry value since it was subtracted
        // at the end of each spawn
        const wantedCarry = -existingSpawns[CONSTANTS.roles.hauler];
        if (wantedCarry > 0) {
            return this.makeHauler(wantedCarry, roomInfo.room.energyCapacityAvailable);
        }
    }

    getBestSpawn(maxCost, sourceCount, neededCarry, existingSpawns, remoteRoomName) {

        // Compare ideal with actual for each role
        // If we have already spawned more than we need, 
        // let's subtract the amount we have and let it propagate to the next remote

        // Start with miners
        const wantedMiners = sourceCount - existingSpawns[CONSTANTS.roles.miner];
        if (wantedMiners > 0) {
            return this.makeMiner(maxCost);
        }
        existingSpawns[CONSTANTS.roles.miner] -= sourceCount;

        // Haulers next
        // Only allow max size haulers, overflow extra wanted parts down to the next round of spawning
        // If we don't have enough to make a max size hauler
        const wantedCarryParts = neededCarry - existingSpawns[CONSTANTS.roles.hauler];
        if (wantedCarryParts > CONSTANTS.maxHaulerLevel * 2) {
            return this.makeHauler(wantedCarryParts, maxCost);
        }
        existingSpawns[CONSTANTS.roles.hauler] -= neededCarry;

        // Reservers -> just one per remote
        const wantedReservers = 1 - existingSpawns[CONSTANTS.roles.reserver];
        if (wantedReservers > 0) {
            return this.makeClaimer();
        }
        existingSpawns[CONSTANTS.roles.reserver] -= 1;
    }

    getUpkeepEstimates(homeRoomInfo, sourceCount, neededCarry) {

        function calculateUpkeep(creeps, calculation) {
            return creeps.reduce((total, curr) => total + calculation(curr.body), 0) / CREEP_LIFE_TIME;
        }

        // Let's get some basic upkeep costs for creeps in this remote
        const upkeeps = { energy: 0, spawnTime: 0 };
        const maxCost = homeRoomInfo.room.energyCapacityAvailable;

        // Start with miners
        const miners = [];
        for (let i = 0; i < sourceCount; i++) {
            miners.push(this.makeMiner(maxCost));
        }
        upkeeps.energy += calculateUpkeep(miners, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(miners, creepSpawnUtility.getSpawnTime);

        // Haulers next
        const haulers = [];
        // Keep making haulers until we have enough to transport all energy we'll mine
        while (neededCarry > 0) {
            const hauler = this.makeHauler(neededCarry, maxCost);
            neededCarry -= hauler.body.filter((p) => p === CARRY).length;
            haulers.push(hauler);
        }
        upkeeps.energy += calculateUpkeep(haulers, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(haulers, creepSpawnUtility.getSpawnTime);

        // Finally, claimers
        const claimerBody = this.makeClaimer().body;
        upkeeps.energy += creepSpawnUtility.getCost(claimerBody) / CREEP_CLAIM_LIFE_TIME;
        upkeeps.spawnTime += creepSpawnUtility.getSpawnTime(claimerBody) / CREEP_CLAIM_LIFE_TIME;

        return upkeeps;
    }

    getTotalAvgSpawnTime(roomInfo) {

    }
}

module.exports = RemoteSpawnHandler;