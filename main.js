/*

Tyrant Bot V2

*/

// Make sure some essential objects are initialized
if (!Memory.creeps) {
    Memory.creeps = {};
}
if (!Memory.rooms) {
    Memory.rooms = {};
}
if (!Memory.bases) {
    Memory.bases = {};
}

// Globals
global.CONSTANTS = require("./constants");
global.DEBUG = {
    logTasks: true,
    alertOnIdle: false,

    drawOverlay: false,
    drawRemoteOwnership: false,
    drawContainerOverlay: false,
    drawTrafficArrows: true,

    trackCPUUsage: true,
    trackRCLProgress: true,
    trackCreepCounts: true,
    trackActiveRemotes: true,
    trackSpawnUsage: true,

    logRemotePlanning: true,
    logRemoteDropping: true,
    replanRemotesOnReload: false,

    runProfiler: false,

    validateBasePlans: true,
    testBasePlanSerialization: true,
    cpuPrintoutFigures: 4,
};
global.RELOAD = true;

// Extensions
global.betterPathing = require("./betterPathing");
require("betterRoomVisual");

// Data
const RoomInfo = require("./roomInfo");
const roomInfos = {};

// Managers
const EconomyManager = require("./economyManager");
const TowerManager = require("./towerManager");
const ColonyConstructionManager = require("./colonyConstructionManager");

// Tasks
const HaulerManager = require("./haulerManager");
const MinerManager = require("./minerManager");
const UpgraderManager = require("./upgraderManager");
const ScoutManager = require("./scoutManager");
const RepairerManager = require("./repairerManager");
const BuilderManager = require("./builderManager");
const ReserverManager = require("./reserverManager");
const DefenderManager = require("./defenderManager");
const MineralMinerManager = require("./mineralMinerManager");

// Mapping
const creepRoleMap = {
    [CONSTANTS.roles.hauler]: new HaulerManager(),
    [CONSTANTS.roles.miner]: new MinerManager(),
    [CONSTANTS.roles.upgrader]: new UpgraderManager(),
    [CONSTANTS.roles.scout]: new ScoutManager(),
    [CONSTANTS.roles.repairer]: new RepairerManager(),
    [CONSTANTS.roles.builder]: new BuilderManager(),
    [CONSTANTS.roles.reserver]: new ReserverManager(),
    [CONSTANTS.roles.defender]: new DefenderManager(),
    [CONSTANTS.roles.mineralMiner]: new MineralMinerManager(),
};

// Economy
const economyManager = new EconomyManager();

// Base planning
const BasePlanner = require("./base.basePlanner");
const basePlanner = new BasePlanner();

// Defense
const towerManager = new TowerManager();

// Construction
const constructionManager = new ColonyConstructionManager();

// Hauling
const BasicHaulingRequester = require("./basicHaulingRequester");
const haulingRequester = new BasicHaulingRequester();

// Stats and Debug
const overlay = require("./overlay");
const trackStats = require("./trackStats");
const profiler = require("./profiler");

module.exports.loop = function () {
    // Passive pixel generation
    // Disabled on most servers
    if (Game.cpu.generatePixel) {
        if (Game.cpu.bucket >= 10000) {
            Game.cpu.generatePixel();
        }
    }

    // Initialize our colonies
    for (const room in Game.rooms) {
        if (!Game.rooms[room].controller || !Game.rooms[room].controller.my) {
            continue;
        }
        if (!Memory.bases[room]) {
            Memory.bases[room] = {};
        }
        if (!roomInfos[room]) {
            roomInfos[room] = new RoomInfo(Game.rooms[room]);
        }
        roomInfos[room].initializeTickInfo();
        const info = roomInfos[room];

        // Handle economy (remotes and spawns)
        profiler.startSample("Economy " + room);
        economyManager.run(info);
        profiler.endSample("Economy " + room);

        // Handle construction
        profiler.startSample("Construction " + room);
        constructionManager.run(info);
        profiler.endSample("Construction " + room);

        // Track RCL progress
        if (DEBUG.trackRCLProgress) {
            overlay.addHeading(info.room.name, "- RCL -");
            const averageRCL = trackStats.trackRCL(info.room.name);
            overlay.addText(info.room.name, {
                "RCL Per Tick": averageRCL.toFixed(3),
            });
            const neededEnergyToNextRCL =
                info.room.controller.progressTotal -
                info.room.controller.progress;
            const ticksUntilNextRCL = Math.floor(
                neededEnergyToNextRCL / averageRCL
            );
            overlay.addText(info.room.name, {
                "Next RCL In": ticksUntilNextRCL,
            });
        }

        // Defense
        towerManager.run(info);

        // Hauling requests
        haulingRequester.generateBasicRequests(info);

        // DEBUG
        if (!basePlanner.getPlan(info.room.name)) {
            basePlanner.generateNewRoomPlan(info);
        }
        basePlanner.visualizePlan(info.room.name);
    }

    // Run creeps
    profiler.startSample("Creeps");
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        if (creep) {
            // Skip haulers until the end
            if (creep.memory.role === CONSTANTS.roles.hauler) {
                continue;
            }

            // Map the creep's role to its appropriate manager and run behaviour
            if (creepRoleMap[creep.memory.role]) {
                profiler.startSample(creep.name);
                creepRoleMap[creep.memory.role].processCreep(
                    creep,
                    roomInfos[creep.memory.home]
                );
                profiler.endSample(creep.name);
            } else {
                creep.say("Missing");
            }
        } else {
            creepDeath(name);
        }
    }
    // We'll process all haulers after ordinary creeps, in case other creeps created orders this tick
    for (const info of Object.values(roomInfos)) {
        for (const hauler of info.haulers) {
            profiler.startSample(hauler.name);
            creepRoleMap[hauler.memory.role].processCreep(hauler, info);
            profiler.endSample(hauler.name);
        }
    }
    profiler.endSample("Creeps");

    // Track CPU usage
    // (don't track reload because it leads to innacurate averages which take a long time to equalize)
    if (DEBUG.trackCPUUsage && !RELOAD) {
        const rollingAverage = trackStats.trackCPU();
        for (const info of Object.values(roomInfos)) {
            overlay.addHeading(info.room.name, "- CPU Usage -");
            overlay.addText(info.room.name, {
                "Average CPU": rollingAverage.toFixed(3),
                "Last CPU": Game.cpu.getUsed().toFixed(3),
            });
        }
    }

    // Track creeps
    if (DEBUG.trackCreepCounts) {
        for (const info of Object.values(roomInfos)) {
            overlay.addHeading(info.room.name, "- Creeps -");
            overlay.addText(info.room.name, {
                Count: Object.values(Memory.creeps).length,
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
};

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
