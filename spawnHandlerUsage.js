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

    estimateSpawnTimeForUsage(roomInfo, energyToUse) {

        // Let's figure out how much spawn time it will take us to use X amount of energy

    }

    getFirstSpawn(roomInfo, existingSpawns) {

        // Spawns are a little tough to determine for usage
        // We want to spawn enough creeps to use up all of our produces energy 
        // (minus our saving theshold, of course, if one exists)
        // BUT we want to do this while still maximizing the amount of energy we make

        // Let's start by calculating our usage goal
        // This will be a fraction of our income
        // e.x. 50 E/t * 0.8 = 40 E/t usage goal
        const usageGoal = this.calculateUsageGoal(roomInfo, savingFraction);

        // If we're under this goal, we can't simply spawn up to it since that would risk dropping a remote due to missing spawn capacity
        // and in turn causing us to overspawn energy users
        // Instead, let's try to match what it would be by predicting which remotes will be dropped
        

        // Start with upgraders



    }

    /**
     * Determines the existing spawn counts for creeps owned by this room.
     * @param {RoomInfo} roomInfo The info object for the room to count spawns for.
     * @returns {{}} An object mapping roles to either creep count or a sub-object of part counts and existing levels, depending on creep type.
     */
    getExistingSpawns(roomInfo) {

        // Track our existing spawns
        const existingSpawns = {
            builders: {
                levels: [],
            },
            upgraders: {
                work: 0,
            },

            // Measured by creep counts
            repairers: 0,
            scouts: 0,
            defenders: 0,
        };

        // Basic ones
        existingSpawns.repairers = roomInfo.repairers.length;
        existingSpawns.scouts = roomInfo.scouts.length;
        existingSpawns.defenders = roomInfo.defenders.length;

        // More complex here, measuring total WORK for upgraders
        existingSpawns.upgraders.work = roomInfo.upgraders.reduce((total, upgrader) => {
            return total + upgrader.body.filter((p) => p.type === WORK).length;
        });

        // And levels for builders
        existingSpawns.builders.levels = this.getLevels(roomInfo.builders, function(builder) {
            return builder.body.filter((p) => p.type === WORK).length;
        });

        return existingSpawns;
    }









    // INDIVIDUAL SPAWN LOGIC BELOW



    trySpawnScout(roomInfo) {
        // Don't need more than one scout per room
        if (roomInfo.scouts.length) {
            return;
        }
        return creepMaker.makeScout();
    }

    trySpawnDefender(roomInfo) {  
        const enemies = roomInfo.getEnemies();
        if (enemies.length > roomInfo.defenders.length) {
    
            // Find our strongest enemy
            const mostFightParts = enemies.reduce((strongest, curr) => {
                const fightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL).length;
                return fightParts > strongest ? fightParts : strongest;
            }, 0);
    
            // Make an appropriately sized defender
            return creepMaker.makeMiniDefender(Math.ceil(mostFightParts / 4), roomInfo.room.energyCapacityAvailable);
        }
    }

    trySpawnRepairer(roomInfo) {   
        // Don't be too concerned unless these structures get extra low since they decay naturally
        const REPAIR_THRESHOLDS = {
            [STRUCTURE_WALL]: 0.002,
            [STRUCTURE_RAMPART]: 0.005,
            [STRUCTURE_CONTAINER]: 0.5,
            [STRUCTURE_ROAD]: 0.5
        };
        
        if (roomInfo.repairers.length) {
            return;
        }
    
        // Look for any structure below its repair threshold
        const repairStructure = roomInfo.getWantedStructures().find((s) => {
            const threshold = REPAIR_THRESHOLDS[s.structureType] || 1;
            return s.hits / s.hitsMax <= threshold;
        });
        if (repairStructure) {
            return creepMaker.maxRepairer(CONSTANTS.maxRepairerLevel, roomInfo.room.energyCapacityAvailable);
        }
    }

    trySpawnUpgrader(roomInfo) {
        // Upgrader won't be able to do much without their container
        if (!roomInfo.getUpgraderContainer()) {
            return;
        }

        if (creepSpawnUtility.getPredictiveCreeps(roomInfo.upgraders).length === 0) {
            return creepMaker.makeUpgrader(roomInfo.room.energyCapacityAvailable);
        }
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
}

module.exports = UsageSpawnHandler;