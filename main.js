/*

Tyrant Bot V2

*/

// Globals
global.CONSTANTS = require("constants");
global.DEBUG = {
    logTasks: true,
    drawOverlay: true,
    drawRoadOverlay: false,
    drawPathOverlay: false,
    drawContainerOverlay: false,
    trackSpawnUsage: true,
    trackCPUUsage: true,
    trackRCLProgress: true,
    trackCreepCounts: true,
    logRemotePlanning: true,
    replanRemotesOnReload: false,

    runProfiler: false,
};
global.RELOAD = true;

// Managers
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");
const TowerManager = require("towerManager");
const RemoteManager = require("remoteManager");
const ColonyConstructionManager = require("colonyConstructionManager");

// Data
const RoomInfo = require("roomInfo");

// Tasks
const HaulerTaskGenerator = require("haulerTaskGenerator");
const MinerTaskGenerator = require("minerTaskGenerator");
const UpgraderTaskGenerator = require("upgraderTaskGenerator");
const ScoutTaskGenerator = require("scoutTaskGenerator");
const RepairerTaskGenerator = require("repairerTaskGenerator");
const BuilderTaskGenerator = require("builderTaskGenerator");

const ReserverTaskGenerator = require("reserverTaskGenerator");
const DefenderTaskGenerator = require("defenderTaskGenerator");

const haulerManager = new CreepManager(new HaulerTaskGenerator());
const minerManager = new CreepManager(new MinerTaskGenerator());
const upgraderManager = new CreepManager(new UpgraderTaskGenerator());
const scoutManager = new CreepManager(new ScoutTaskGenerator());
const repairerManager = new CreepManager(new RepairerTaskGenerator());
const builderManager = new CreepManager(new BuilderTaskGenerator());

const reserverManager = new CreepManager(new ReserverTaskGenerator());
const defenderManager = new CreepManager(new DefenderTaskGenerator());

// Mapping
const creepRoleMap = {
    [CONSTANTS.roles.hauler]: haulerManager,
    [CONSTANTS.roles.miner]: minerManager,
    [CONSTANTS.roles.upgrader]: upgraderManager,
    [CONSTANTS.roles.scout]: scoutManager,
    [CONSTANTS.roles.repairer]: repairerManager,
    [CONSTANTS.roles.builder]: builderManager,
    [CONSTANTS.roles.reserver]: reserverManager,
    [CONSTANTS.roles.defender]: defenderManager,
};

// Spawning
const spawnManager = new SpawnManager();

const CrashSpawnHandler = require("crashSpawnHandler");
const ProductionSpawnHandler = require("spawnHandlerProduction");
const UsageSpawnHandler = require("spawnHandlerUsage")

const crashSpawnHandler = new CrashSpawnHandler();
const productionSpawnHandler = new ProductionSpawnHandler();
const usageSpawnHandler = new UsageSpawnHandler();


// Defense
const towerManager = new TowerManager();

// Remote
const remoteManager = new RemoteManager();

// Construction
const constructionManager = new ColonyConstructionManager();

// Stats and Debug
const overlay = require("overlay");
const trackStats = require("trackStats");
const profiler = require("profiler");

module.exports.loop = function() {

    // Let's make sure some essential objects are initialized
    if (!Memory.rooms) {
        Memory.rooms = {};
    }
    if (!Memory.bases) {
        Memory.bases = {};
    }

    // Passive pixel generation
    // Disabled on most servers
    if (Game.cpu.generatePixel) {
        if (Game.cpu.bucket >= 10000) {
            Game.cpu.generatePixel();
        }
    }
    
    // Initialize our info map
    const roomInfos = {};
    for (const room in Game.rooms) {
        if (!Game.rooms[room].controller || !Game.rooms[room].controller.my) {
            continue;
        }

        roomInfos[room] = new RoomInfo(Game.rooms[room]);
        const info = roomInfos[room];

        // Don't try to spawn in rooms that can't
        if (info.spawns.length) {

            // Handle construction
            profiler.startSample("Construction " + room);
            constructionManager.run(info);
            profiler.endSample("Construction " + room);

            // This represent the fraction of our total spawn capacity we sit at
            // i.e. the amount of time we spend spawning / 1
            const avgSustainCost = basicSpawnHandlers.reduce((total, curr) => total + curr.getTotalAvgSpawnTime(info), 0) / info.spawns.length;
            if (DEBUG.trackSpawnUsage) {
                overlay.addHeading(info.room.name, "- Spawns -");
                overlay.addText(info.room.name, { [info.room.name]: "(" + (Math.round(avgSustainCost * 1000) / 1000).toFixed(3) + ")" });
            }

            let remoteSustainCost = 0;

            // Spawn handlers are passed in order of priority
            const currentSpawnHandlers = [
                crashSpawnHandler,
                ...basicSpawnHandlers,
                repairerSpawnHandler,
                builderSpawnHandler,
            ];
            if (info.remoting) {

                // Plan remotes for bases!
                profiler.startSample("Remotes " + room);
                remoteSustainCost = remoteManager.run(info, avgSustainCost);
                profiler.endSample("Remotes " + room);

                // Make sure we're spawning for remotes
                currentSpawnHandlers.push(remoteSpawnHandler);
            }

            if (info.getEnemies().length) {
                currentSpawnHandlers.unshift(defenderSpawnHandler);
            }

            // Spawn progress
            if (DEBUG.trackSpawnUsage) {
                overlay.addText(info.room.name, { "Spawn Capacity": (Math.round((avgSustainCost + remoteSustainCost) * 1000) / 1000).toFixed(3) + " / 1" });
            }

            // Track RCL progress
            if (DEBUG.trackRCLProgress) {
                overlay.addHeading(info.room.name, "- RCL -");
                const averageRCL = trackStats.trackRCL(info.room.name);
                overlay.addText(info.room.name, { "RCL Per Tick": (Math.round(averageRCL * 1000) / 1000).toFixed(3) });
                const neededEnergyToNextRCL = info.room.controller.progressTotal - info.room.controller.progress;
                const ticksUntilNextRCL = Math.floor(neededEnergyToNextRCL / averageRCL);
                overlay.addText(info.room.name, { "Next RCL In": ticksUntilNextRCL});
            }

            // Handle spawns
            profiler.startSample("Spawns " + room);
            spawnManager.run(info, currentSpawnHandlers);
            profiler.endSample("Spawns " + room);
        }

        // Defense
        towerManager.run(info);
    }

    // Run creeps
    profiler.startSample("Creeps");
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        if (creep) {

            // Map the creep's role to its appropriate manager and run behaviour
            if (creepRoleMap[creep.memory.role]) {
                profiler.startSample(creep.name);
                creepRoleMap[creep.memory.role].processCreep(creep, roomInfos[creep.memory.home]);
                profiler.endSample(creep.name);
            }
            else {
                creep.say("Missing");
            }
        }
        else {
            creepDeath(name);
        }
    }
    profiler.endSample("Creeps");

    // Track CPU usage
    if (DEBUG.trackCPUUsage) {
        const rollingAverage = trackStats.trackCPU();
        for (const info of Object.values(roomInfos)) {
            overlay.addHeading(info.room.name, "- CPU Usage -");
            overlay.addText(info.room.name, { 
                "Average CPU": (Math.round(rollingAverage * 1000) / 1000).toFixed(3),
                "Last CPU": (Math.round(Game.cpu.getUsed() * 1000) / 1000).toFixed(3),
            });
        }
    }

    // Track creeps
    if (DEBUG.trackCreepCounts) {
        for (const info of Object.values(roomInfos)) {
            overlay.addHeading(info.room.name, "- Creeps -");
            overlay.addText(info.room.name, {
                "Count": Object.values(Memory.creeps).length,
            });
        }
    }

    profiler.printout();

    // Finalize overlays
    for (const info of Object.values(roomInfos)) {
        overlay.finalizePanels(info.room.name);
    }

    // If we reloaded
    global.RELOAD = false;
}

/**
 * Processes the death of a creep to run any cleanup code.
 * @param {string} name The name of the deceased creep.
 */
function creepDeath(name) {

    const role = Memory.creeps[name].role;
    if (creepRoleMap[role]) {
        creepRoleMap[role].freeCreep(name);
    }

    delete Memory.creeps[name];
}