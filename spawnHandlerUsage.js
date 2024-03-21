const creepSpawnUtility = require("creepSpawnUtility");
const creepMaker = require("creepMakerUsage");
const levelUtility = require("leveledSpawnUtility");

class UsageSpawnHandler {
    
    getNextSpawn(roomInfo, energyToUse) {

        const repairer = this.trySpawnRepairer(roomInfo);
        if (repairer) {
            return repairer;
        }

        // Other types of creep spawns that would be regular, but not contribute to
        // production or transport of energy would go here
        // e.g. future mineral harvesters, etc.

        const upgrader = this.trySpawnUpgrader(roomInfo, energyToUse);
        if (upgrader) {
            return upgrader;
        }

        const scout = this.trySpawnScout(roomInfo);
        if (scout) {
            return scout;
        }
    }

    /**
     * Estimates spawn time needed for this base to use X amount of energy.
     * @param {RoomInfo} roomInfo The base to calculate use for.
     * @param {number} energyToUse The target amount of energy to use.
     * @returns {number} An amount of spawn time.
     */
    estimateSpawnTimeForUsage(roomInfo, energyToUse) {

        // Let's figure out how much spawn time it will take us to use X amount of energy
        // A typical usage layout would look something like the following
        // - 1 scout
        // - 1 repairer
        // - Any remaining upgraders

        let estimatedSpawnTime = 0;
        function recordCreep(body) {
            estimatedSpawnTime += creepSpawnUtility.getSpawnTime(body) / CREEP_LIFE_TIME;

            // Remember that spawning creeps also uses energy, so we'll have to subtract
            // the cost from the energy we have left to use
            energyToUse -= creepSpawnUtility.getCost(body) / CREEP_LIFE_TIME;

            // Return true when we're done
            return energyToUse <= 0;
        }

        // Scout
        if (recordCreep(creepMaker.makeScout().body)) {
            return estimatedSpawnTime;
        }

        // Repairer
        if (recordCreep(creepMaker.makeRepairer(CONSTANTS.maxRepairerLevel, roomInfo.room.energyCapacityAvailable).body)) {
            return estimatedSpawnTime;
        }

        // Upgraders
        estimatedSpawnTime += this.estimateNeededUpgraders(roomInfo, energyToUse).spawnTime;

        return estimatedSpawnTime;
    }

    /**
     * Estimates the needed level composition and spawn times of upgraders
     * to use as close to the required amount of energy as possible without going over.
     * @param {RoomInfo} roomInfo The base to spawn for.
     * @param {number} energyToUse The target amount of energy to use.
     * @returns {{}} An object with the total spawn time and level composition of needed upgraders to meet the energy goal.
     */
    estimateNeededUpgraders(roomInfo, energyToUse) {

        // This snippet spawns upgraders of increasing level until we have enough to use our energy goal
        for (let level = 1; true; level++) {

            let levelUsage = 0;
            let totalParts = 0;
            const levelComposition = [];

            let remainingLevel = level;
            while (remainingLevel > 0) {
                const nextLevel = Math.min(remainingLevel, CONSTANTS.maxUpgraderLevel);
                const upgraderBody = creepMaker.makeUpgrader(nextLevel, roomInfo.room.energyCapacityAvailable).body;

                // Factor in the cost of the body and usage of the upgrader
                levelUsage += creepSpawnUtility.getCost(upgraderBody) / CREEP_LIFE_TIME;
                levelUsage += upgraderBody.filter((p) => p === WORK).length * UPGRADE_CONTROLLER_POWER;

                if (levelUsage > energyToUse) {

                    // This level caused us to hit our max, let's backup one level
                    // That's our max upgrader composition
                    const adjustedLevel = nextLevel - 1;
                    if (adjustedLevel > 0) {
                        levelComposition.push(adjustedLevel);
                        totalParts += creepMaker.makeUpgrader(adjustedLevel, roomInfo.room.energyCapacityAvailable).body;
                    }

                    const spawnTime = (totalParts * CREEP_SPAWN_TIME) / CREEP_LIFE_TIME;
                    return { spawnTime: spawnTime, levels: levelComposition };
                }

                levelComposition.push(nextLevel);
                totalParts += upgraderBody.length;
                remainingLevel -= CONSTANTS.maxUpgraderLevel;
            }
        }
    }

    /**
     * Estimates the current amount of energy that the creeps of this base are actually using.
     * @param {RoomInfo} roomInfo The base object to estimate for.
     * @returns {number} The average estimated energy usage per tick.
     */
    estimateCurrentUsage(roomInfo) {

        // Estimate how much we're spending on average in this room
        let totalEnergyUsage = 0;

        // Scout and repairers
        totalEnergyUsage += creepSpawnUtility.getCost(creepMaker.makeScout().body) / CREEP_LIFE_TIME;
        totalEnergyUsage += creepSpawnUtility.getCost(creepMaker.makeRepairer(
            CONSTANTS.maxRepairerLevel, roomInfo.room.energyCapacityAvailable).body) / CREEP_LIFE_TIME;
    
        // Upgraders
        totalEnergyUsage += roomInfo.upgraders.reduce((total, upgrader) => {
            return total 
                + creepSpawnUtility.getCost(upgrader.body) 
                + (upgrader.body.filter((p) => p.type === WORK).length * UPGRADE_CONTROLLER_POWER);
        }, 0);

        return totalEnergyUsage;
    }

    //#region Spawning

    trySpawnUpgrader(roomInfo, energyToUse) {

        // Upgraders won't be able to do much without their container
        if (!roomInfo.getUpgraderContainer()) {
            return;
        }

        // Let's look for the first upgrader we want but don't have
        const wantedLevels = this.estimateNeededUpgraders(roomInfo, energyToUse).levels
        const actualLevels = levelUtility.getLevels(creepSpawnUtility.getPredictiveCreeps(roomInfo.upgraders), function(upgrader) {
            return upgrader.body.filter((p) => p.type === MOVE).length;
        });

        // Let's make sure we aren't spawning a ton if we change our leveling scheme
        // If the max level we can support increases when we build a new extension, we'd otherwise
        // spawn a ton trying to replace all level 7s with 8s, for example
        // This way we wait until they die to restructure ourselves
        const wantedSum = wantedLevels.reduce((total, curr) => total + curr, 0);
        const actualSum = actualLevels.reduce((total, curr) => total + curr, 0);
        if (wantedSum < actualSum) {
            return;
        }

        // If we find one, let's spawn it
        const missingLevel = levelUtility.getMissingLevel(wantedLevels, actualLevels);
        if (missingLevel) {
            return creepMaker.makeUpgrader(missingLevel, roomInfo.room.energyCapacityAvailable);
        }
    }


    trySpawnRepairer(roomInfo) {           
        if (roomInfo.repairers.length) {
            return;
        }
    
        // Don't be too concerned unless these structures get extra low since they decay naturally
        const REPAIR_THRESHOLDS = {
            [STRUCTURE_WALL]: 0.002,
            [STRUCTURE_RAMPART]: 0.005,
            [STRUCTURE_CONTAINER]: 0.5,
            [STRUCTURE_ROAD]: 0.5
        };

        // Look for any structure below its repair threshold
        const repairStructure = roomInfo.getWantedStructures().find((s) => {
            const threshold = REPAIR_THRESHOLDS[s.structureType] || 1;
            return s.hits / s.hitsMax <= threshold;
        });
        if (repairStructure) {
            return creepMaker.makeRepairer(CONSTANTS.maxRepairerLevel, roomInfo.room.energyCapacityAvailable);
        }
    }

    trySpawnScout(roomInfo) {
        // Don't need more than one scout per room
        if (roomInfo.scouts.length) {
            return;
        }
        return creepMaker.makeScout();
    }

    trySpawnBuilder(roomInfo) {
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
            return creepMaker.makeBuilder(wantedWork, roomInfo.room.energyCapacityAvailable);
        }
    }

    //#endregion
}

module.exports = UsageSpawnHandler;