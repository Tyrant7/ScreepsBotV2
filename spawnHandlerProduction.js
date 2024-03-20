const remoteUtility = require("remoteUtility");
const creepSpawnUtility = require("creepSpawnUtility");
const creepMaker = require("creepMakerProduction");
const levelUtility = require("leveledSpawnUtility");

class ProductionSpawnHandler {

    /**
     * Gets the highest priority spawn to keep producers at a balanced level.
     * @param {RoomInfo} roomInfo The base to spawn for.
     * @returns {{}} An object with meta-data for spawning.
     */
    getNextSpawn(roomInfo) {

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
                const idealHaulerLevels = levelUtility.getIdealLevels(Math.ceil(wantedCarry / 2), 
                    CONSTANTS.maxHaulerLevel, 
                    creepMaker.haulerLevelCost, 
                    roomInfo.room.energyCapacityAvailable);
                const missingHaulerLevel = levelUtility.getMissingLevel(idealHaulerLevels, existingSpawns.haulers.levels);
                if (missingHaulerLevel) {
                    return creepMaker.makeHauler(missingHaulerLevel, roomInfo.room.energyCapacityAvailable);
                }
            }
        }

        // Find our existing spawns before anything else
        const existingSpawns = this.getExistingSpawns(roomInfo);

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
        existingSpawns.haulers.levels = levelUtility.getLevels(roomInfo.haulers, function(hauler) {
            return hauler.body.filter((p) => p.type === MOVE).length;
        });

        return existingSpawns;
    }

    /**
     * Estimates the energy production with only the currently spawned creeps.
     * @param {RoomInfo} roomInfo The base to estimate for.
     * @returns {number} The total estimated production.
     */
    estimteCurrentProduction(roomInfo) {

        // TODO //
        // Include current room and remotes

        throw new Error("Not implemented!");
    }

    //#region Upkeep

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

    //#endregion
}

module.exports = ProductionSpawnHandler;