const creepMaker = require("./creepMaker");
const remoteUtility = require("./remoteUtility");
const creepSpawnUtility = require("./creepSpawnUtility");

// 10_000 energy -> one build part worth of workers
const WORK_TO_BUILD_RATIO = 10000;

// Don't be too concerned unless these structures get extra low since they decay naturally
const REPAIR_THRESHOLDS = {
    [STRUCTURE_WALL]: 0.002,
    [STRUCTURE_RAMPART]: 0.005,
    [STRUCTURE_CONTAINER]: 0.5,
    [STRUCTURE_ROAD]: 0.5
};

// We'll need at least this many levels of upgrader missing before we spawn a new one
const UPGRADER_LEVEL_MARGIN = Math.floor(CONSTANTS.maxUpgraderLevel / 1.5);

// How many planned structures should we have before we allocate additional repairers
const PLANNED_STRUCTURE_TO_REPAIRER_RATIO = 450;

// Static reserver cost to determine how much energy capacity we can start reserving at
const RESERVER_COST = creepSpawnUtility.getCost(creepMaker.makeReserver().body);

// #region Spawn Handlers

class SpawnHandler {
    getNextSpawn(roomInfo) {
        throw new Error("Must implement `getNextSpawn()`!");
    }
}

class CrashSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        
        // Let's ensure our colony has met some basic requirements before spawning additional creeps
        // In this case we should be good to restart now
        if (roomInfo.miners.length >= 1 && roomInfo.haulers.length >= 1) {
            return;
        }

        // If we have a miner but no haulers, let's spawn a hauler to restock quickly
        if (roomInfo.miners.length) {

            // Make sure we can afford any hauler at all
            const hauler = creepMaker.makeHauler(CONSTANTS.maxHaulerLevel, Math.max(roomInfo.room.energyAvailable, SPAWN_ENERGY_START));
            if (hauler.body.length) {
                return hauler;
            }
        }
        else {
            // We have no miner
            return creepMaker.makeRecoveryMiner(roomInfo.room.energyCapacityAvailable);
        }
    }
}

class DefenseSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        const enemies = roomInfo.getEnemies();
        if (enemies.length > roomInfo.defenders.length) {

            // Find our strongest enemy
            const mostFightParts = enemies.reduce((strongest, curr) => {
                const fightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL).length;
                return fightParts > strongest ? fightParts : strongest;
            }, 0);

            // Make an appropriately sized defender
            // i.e. one level larger in size
            return creepMaker.makeMiniDefender(Math.ceil(mostFightParts / 4) + 1, roomInfo.room.energyCapacityAvailable);
        }
    }
}

class ProductionSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        function checkIfSpawn() {
            if (wantedMiners > existingSpawns.miners) {
                return creepMaker.makeMiner(roomInfo.room.energyCapacityAvailable);
            }
            if (wantedReservers > existingSpawns.reservers && roomInfo.room.energyCapacityAvailable >= RESERVER_COST) {
                return creepMaker.makeReserver();
            }
            if (wantedCarry > existingSpawns.haulerCarry) {
                return creepMaker.makeHauler(CONSTANTS.maxHaulerLevel, roomInfo.room.energyCapacityAvailable);
            }
            if (wantedBuilderWork > existingSpawns.builderWork && roomInfo.builders.length < CONSTANTS.maxBuilderCount) {
                const builder = creepMaker.makeBuilder(CONSTANTS.smallBuilderLevel, roomInfo.room.energyCapacityAvailable);
                // Make sure this builder prioritizes building in remotes over our base room
                builder.memory.remote = true;
                return builder;
            }
        }

        // Find our existing spawns before anything else
        const existingSpawns = this.getExistingSpawns(roomInfo);

        // Main room first
        let wantedMiners = roomInfo.sources.length;
        let wantedReservers = 0;
        let wantedCarry = roomInfo.getMaxIncome();
        let reservedRooms = new Set();

        // Calculate builder need
        const energyForBuilds = roomInfo.constructionSites.filter(site => {
            return site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER;
        }).reduce((total, curr) => {
            return total + curr.progressTotal - curr.progress;
        }, 0);
        let wantedBuilderWork = Math.ceil(energyForBuilds / WORK_TO_BUILD_RATIO);

        const nextSpawn = checkIfSpawn();
        if (nextSpawn) {
            return nextSpawn;
        }

        // Iterate over each remote until we find one that hasn't had its need met yet
        // Note: this array is unsorted so we may end up spawning too many/few reservers early on
        // TODO: FIX //
        const remotes = remoteUtility.getRemotePlans(roomInfo.room.name);
        for (const remote of remotes) {
            if (!remote.active) {
                continue;
            }

            wantedMiners += 1;
            wantedCarry += remote.neededCarry;

            // Since some remotes have the same room, we'll use a set to track the ones we need to reserve
            reservedRooms.add(remote.room);
            wantedReservers = reservedRooms.size;

            // Add up work
            const buildEnergy = roomInfo.getConstructionQueue().filter((s) => s.pos.roomName === remote.room).reduce((total, curr) => {
                return total + CONSTRUCTION_COST[curr.type];
            }, 0);
            wantedBuilderWork += Math.ceil(buildEnergy / WORK_TO_BUILD_RATIO);

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
            haulerCarry: 0,
            builderWork: 0,
        };

        existingSpawns.miners = roomInfo.miners.length;
        existingSpawns.reservers = roomInfo.reservers.length;

        // We'll have to do something slightly different for haulers that are measured by part counts
        existingSpawns.haulerCarry = roomInfo.haulers.reduce((total, hauler) => {
            return total + hauler.body.filter((p) => p.type === CARRY).length;
        }, 0);

        // Same for builders
        existingSpawns.builderWork = roomInfo.builders.reduce((total, builder) => {
            return total + builder.body.filter((p) => p.type === WORK).length;
        }, 0);

        return existingSpawns;
    }
}   

class UsageSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        const spawnOrder = [
            this.trySpawnRepairer,
            this.trySpawnBuilder,

            // Other types of creep spawns that would be regular, but not contribute to
            // production or transport of energy would go here
            // e.g. future mineral harvesters, etc.

            this.trySpawnUpgrader,
            this.trySpawnScout,
            this.trySpawnMineralMiner,
        ];

        // For us to attempt an upgrader first if we're in danger of downgrade
        if (roomInfo.room.controller.ticksToDowngrade <= CONSTANTS.controllerDowngradeDangerLevel) {
            spawnOrder.shift(this.trySpawnUpgrader);
        }

        // Loop over our spawn handlers in order of priority
        for (const getNextSpawn of spawnOrder) {
            const next = getNextSpawn(roomInfo);
            if (next) {
                return next;
            }
        }
    }

    //#region Spawning

    trySpawnUpgrader(roomInfo) {

        // Special upgraders for starting out
        if (roomInfo.room.energyCapacityAvailable <= SPAWN_ENERGY_START) {
            return creepMaker.makeMiniUpgrader();
        }
        
        /**
        * Estimates the needed amount of upgraders in levels
        * to use as close to the required amount of energy as possible.
        * @param {RoomInfo} roomInfo The base to spawn for.
        * @param {number} energyToUse The target amount of energy to use.
        * @param {boolean} allowOver Should we allow ourselves to go one level over our energy goal?
        * @returns {number} The total level of needed upgraders required to meet the energy goal.
        */
        function estimateNeededUpgraders(roomInfo, energyToUse, allowOver) {
            for (let level = 1; true; level++) {
    
                let levelUsage = 0;
                let remainingLevel = level;
                while (remainingLevel > 0) {
                    const nextLevel = Math.min(remainingLevel, CONSTANTS.maxUpgraderLevel);
                    const upgraderBody = creepMaker.makeUpgrader(nextLevel, roomInfo.room.energyCapacityAvailable).body;
    
                    // Factor in the cost of the body and usage of the upgrader
                    levelUsage += creepSpawnUtility.getCost(upgraderBody) / CREEP_LIFE_TIME;
                    levelUsage += upgraderBody.filter((p) => p === WORK).length * UPGRADE_CONTROLLER_POWER;
    
                    // Once we go over our threshold, we know that we can fit n-1 upgrader levels
                    if (levelUsage > energyToUse) {
                        return allowOver ? level : level - 1;
                    }
    
                    remainingLevel -= CONSTANTS.maxUpgraderLevel;
                }
            }
        }

        // Simply, we're going to spawn enough upgraders to use our income
        const estimatedIncome = remoteUtility.getRemotePlans(roomInfo.room.name).reduce((total, curr) => {
            return total + (curr.active ? curr.score : 0);
        }, 0) + roomInfo.getMaxIncome();

        // If we're RCL 8, there's a limit of how much we can upgrade
        const isMaxRCL = roomInfo.room.controller.level === 8;
        const maxUpgrade = isMaxRCL ? CONTROLLER_MAX_UPGRADE_PER_TICK : Infinity;
        const finalUsableIncome = Math.max(Math.min(estimatedIncome, maxUpgrade), 0)

        // If we're at max RCL, it's better for our GCL to upgrade over our limit than under
        const wantedLevels = estimateNeededUpgraders(roomInfo, finalUsableIncome, isMaxRCL);
        const actualLevels = creepSpawnUtility.getPredictiveCreeps(roomInfo.upgraders).map((u) => {
            return u.body.filter((p) => p.type === MOVE).length;
        });

        // Always have an upgrader at max RCL. It will be smaller than our margin
        if (isMaxRCL && !roomInfo.upgraders.length && wantedLevels > 0) {
            return creepMaker.makeUpgrader(wantedLevels, roomInfo.room.energyCapacityAvailable);
        }

        // We don't want to spawn a ton of smaller upgraders as our economy grows though,
        // so we'll leave a margin of difference between our wanted and existing counts
        if (wantedLevels - actualLevels >= UPGRADER_LEVEL_MARGIN) {
            return creepMaker.makeUpgrader(CONSTANTS.maxUpgraderLevel, roomInfo.room.energyCapacityAvailable);
        }
    }

    trySpawnRepairer(roomInfo) {

        // Don't need repairers so early
        if (roomInfo.room.controller.level <= 2) {
            return;
        }

        // Allocate X repairers per planned structures
        const plannedRoads = remoteUtility.getRemotePlans(roomInfo.room.name).reduce((total, curr) => {
            // N roads + 1 container
            return total + (curr.active ? curr.roads.length + 1 : 0);
        }, 0);    
        if (roomInfo.repairers.length >= 1 + Math.ceil(plannedRoads / PLANNED_STRUCTURE_TO_REPAIRER_RATIO)) {
            return;
        }
    
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
        if (roomInfo.scouts.length >= CONSTANTS.maxScouts) {
            return;
        }
        return creepMaker.makeScout();
    }

    trySpawnBuilder(roomInfo) {
        // Don't need builders so early
        if (roomInfo.room.controller.level <= 1) {
            return;
        }

        // Don't allow us to exceed a hard max of builders
        if (roomInfo.builders.length >= CONSTANTS.maxBuilderCount) {
            return;
        }

        // First figure out how much energy it will take to build our desired structures
        // (not roads or containers, those are handled by our productionSpawnHandler)
        const energyForThisRoom = roomInfo.constructionSites.filter(site => {
            return site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER;
        }).reduce((total, curr) => {
            return total + curr.progressTotal - curr.progress;
        }, 0);

        // Limit energy for this room to what's in our storage to prevent massive overspawning
        const totalForThisRoom = roomInfo.storage 
            ? Math.min(roomInfo.storage.store[RESOURCE_ENERGY], energyForThisRoom)
            : energyForThisRoom;

        // Figure out how much WORK we already have
        const existingWork = roomInfo.builders.reduce((total, curr) => {
            return total + curr.body.filter((p) => p.type === WORK).length;
        }, 0);

        // Next, let's allocate an arbitrary amount of WORK using this formula
        // N WORK = Math.ceil(totalEnergyToBuild / WORK_TO_BUILD_RATIO)
        const wantedWork = Math.ceil(totalForThisRoom / WORK_TO_BUILD_RATIO);
        const nextWork = wantedWork - existingWork;
        if (nextWork > 0) {
            // If we really don't need much work, let's just spawn a smaller builder
            if (wantedWork < CONSTANTS.maxBuilderLevel) {
                return creepMaker.makeBuilder(nextWork, roomInfo.room.energyCapacityAvailable);
            }
            // Otherwise, let's always spawn a max size one
            return creepMaker.makeBuilder(CONSTANTS.maxBuilderLevel, roomInfo.room.energyCapacityAvailable);
        }
    }

    trySpawnMineralMiner(roomInfo) {
        if (roomInfo.mineralMiners.length) {
            return;
        }
        return creepMaker.makeMineralMiner(CONSTANTS.maxMineralMinerLevel, roomInfo.room.energyCapacityAvailable);
    }

    //#endregion
}

//#endregion

const crashSpawnHandler = new CrashSpawnHandler();
const defenseSpawnHandler = new DefenseSpawnHandler();
const productionSpawnHandler = new ProductionSpawnHandler();
const usageSpawnHandler = new UsageSpawnHandler();

class SpawnManager {

    /**
     * Handles spawning the next needed creep, and returns current spawn usage.
     * @param {RoomInfo} roomInfo The room to spawn for.
     * @returns {number} The current spawn usage expressed as a decimal between 0 and 1.
     */
    trackSpawns(roomInfo) {

        // Visuals
        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                this.showVisuals(spawn);
            }
        }

        // Handle our next spawn
        const inactiveSpawns = roomInfo.spawns.filter((s) => !s.spawning);

        // Limit ourselves to spawning one creep per tick to avoid issues with tracking need
        if (inactiveSpawns.length) {
            const next = this.handleNextSpawn(roomInfo);
            if (next) {
                // Save the room responsible for this creep and start spawning
                next.memory.home = roomInfo.room.name;
                const intentResult = inactiveSpawns[0].spawnCreep(next.body, next.name, { 
                    memory: next.memory,
                });

                // If we can't spawn our desired creep, we'll treat this as all spawns being active
                // i.e. too much spawning -> should drop some remotes
                if (intentResult === ERR_NOT_ENOUGH_ENERGY) {
                    return roomInfo.spawns.length;
                }
            }
        }

        // Track our spawn usage
        return (roomInfo.spawns.length - inactiveSpawns.length);
    }

    /**
     * Gets the next spawn in our priority order.
     * @param {RoomInfo} roomInfo The room to get spawns for.
     * @returns {{}} An object with some spawn data.
     */
    handleNextSpawn(roomInfo) {
        const spawnOrder = [
            crashSpawnHandler,
            defenseSpawnHandler,
            productionSpawnHandler,
            usageSpawnHandler,
        ];
        for (const spawnHandler of spawnOrder) {
            const next = spawnHandler.getNextSpawn(roomInfo);
            if (next) {
                return next;
            }
        }
    }

    /**
     * Shows visuals for this spawn, if spawning.
     * @param {StructureSpawn} spawn The spawn to show visuals for.
     */
    showVisuals(spawn) {
        try {
            const spawningCreep = Game.creeps[spawn.spawning.name];
            const displayName = spawningCreep.name.split(' ')[0] + " " + spawningCreep.name.split(' ')[2];
            Game.rooms[spawn.pos.roomName].visual.text(
                displayName,
                spawn.pos.x,
                spawn.pos.y - 1,
                { align: "center", opacity: 0.8 });
        }
        catch (e) {
            console.log("Error when showing spawn visual: " + e);
        }
    }
}

module.exports = SpawnManager;