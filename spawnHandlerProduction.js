const remoteUtility = require("remoteUtility");
const creepSpawnUtility = require("creepSpawnUtility");
const creepMaker = require("creepMakerProduction");

class ProductionSpawnHandler {

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
            if (wantedCarry >= existingSpawns.haulers.carry) {
                const idealHaulerLevels = this.getIdealLevels(Math.ceil(wantedCarry / 2), 
                    CONSTANTS.maxHaulerLevel, 
                    creepMaker.haulerLevelCost, 
                    roomInfo.room.energyCapacityAvailable);
                const missingHaulerLevel = this.getMissingLevel(idealHaulerLevels, existingSpawns.haulers.levels);
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
        const existingSpawns = {
            miners: 0,
            reservers: 0,
            haulers: {
                carry: 0,
                levels: [],
            }
        };

        existingSpawns.miners = roomInfo.miners.length;
        existingSpawns.reservers = roomInfo.reservers.length;

        // We'll have to do something slightly different for haulers that are measured by part counts
        existingSpawns.haulers.carry = roomInfo.haulers.reduce((total, hauler) => {
            return total + hauler.body.filter((p) => p.type === CARRY).length;
        }, 0);
        existingSpawns.haulers.levels = this.getLevels(roomInfo.haulers, function(hauler) {
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
        return null;
    }

    //#endregion

    // For a base
    estimateUpkeepForBase(roomInfo) {

        function calculateUpkeep(creeps, calculation) {
            return creeps.reduce((total, curr) => total + calculation(curr.body), 0) / CREEP_LIFE_TIME;
        }

        const upkeeps = { energy: 0, spawnTime: 0 };
        const maxCost = roomInfo.room.energyCapacityAvailable;

        const miners = [];
        roomInfo.getSources().forEach((s) => {
            miners.push(creepMaker.makeMiner(maxCost));
        });
        upkeeps.energy += calculateUpkeep(miners, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(miners, creepSpawnUtility.getSpawnTime);

        const haulers = [];
        let neededCarry = roomInfo.getMaxIncome();
        while (neededCarry > 0) {
            const hauler = creepMaker.makeHauler(neededCarry, maxCost);
            neededCarry -= hauler.body.filter((p) => p === CARRY).length;
            haulers.push(hauler);
        }
        upkeeps.energy += calculateUpkeep(haulers, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(haulers, creepSpawnUtility.getSpawnTime);

        return upkeeps;
    }

    // For remotes
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
            miners.push(creepMaker.makeMiner(maxCost));
        }
        upkeeps.energy += calculateUpkeep(miners, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(miners, creepSpawnUtility.getSpawnTime);

        // Haulers next
        const haulers = [];
        // Keep making haulers until we have enough to transport all energy we'll mine
        while (neededCarry > 0) {
            const hauler = creepMaker.makeHauler(neededCarry, maxCost);
            neededCarry -= hauler.body.filter((p) => p === CARRY).length;
            haulers.push(hauler);
        }
        upkeeps.energy += calculateUpkeep(haulers, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(haulers, creepSpawnUtility.getSpawnTime);

        // Finally, reservers
        const reserverBody = creepMaker.makeReserver().body;
        upkeeps.energy += creepSpawnUtility.getCost(reserverBody) / CREEP_CLAIM_LIFE_TIME;
        upkeeps.spawnTime += creepSpawnUtility.getSpawnTime(reserverBody) / CREEP_CLAIM_LIFE_TIME;

        return upkeeps;
    }
}

module.exports = ProductionSpawnHandler;