/*

TyrantBot, created by Tyrant

*/

// Make sure some essential objects are initialized
if (!Memory.creeps) {
    Memory.creeps = {};
}
if (!Memory.scoutData) {
    Memory.scoutData = {};
}
if (!Memory.colonies) {
    Memory.colonies = {};
}
if (!Memory.playerData) {
    Memory.playerData = {};
}
if (!Memory.missions) {
    Memory.missions = {};
}

// Globals
global.ME = "Tyrant7";
global.DEBUG = {
    logTasks: true,
    alertOnIdle: false,

    generatePixels: false,

    drawOverlay: true,
    drawRemoteOwnership: false,
    drawContainerOverlay: false,

    drawTrafficArrows: false,
    drawPathMatrices: false,
    drawWorkingPositions: false,
    warnOnIncompletePath: false,

    trackCPUUsage: true,
    trackRCLProgress: true,
    trackCreepCounts: true,
    trackActiveRemotes: true,
    trackSpawnUsage: true,
    statsPeriodLength: 100,

    logRemotePlanning: false,
    logRemoteDropping: false,
    replanRemotesOnReload: false,

    runProfiler: false,
    profileHeapUsage: false,

    visualizeBasePlan: false,
    replanBaseOnReload: false,
    validateBasePlans: true,
    testBasePlanSerialization: true,
    warnOnFailedSitePlacement: true,
    cpuPrintoutFigures: 4,

    logAppraisal: false,
    logColonization: false,
    showAppraisalScores: false,

    showMissionTargets: false,
};
global.RELOAD = true;

// Extensions
const {
    cachePathMatrix,
    generateDefaultPathMatrix,
    getCachedPathMatrix,
    getWorkingPositions,
} = require("./extension.betterPathing");
require("./extension.betterRoomVisual");
const harabiTrafficManager = require("./extension.harabiTraffic");
require("./extension.trackRCL");
const { doMemhack } = require("./extension.memHack");

// Data
const Colony = require("./data.colony");
const colonies = {};

// Creeps
const HaulerManager = require("./creep.hauler");
const StarterHaulerManager = require("./creep.starterHauler");
const MinerManager = require("./creep.miner");
const UpgraderManager = require("./creep.upgrader");
const ScoutManager = require("./creep.scout");
const RepairerManager = require("./creep.repairer");
const BuilderManager = require("./creep.builder");
const ReserverManager = require("./creep.reserver");
const DefenderManager = require("./creep.defender");
const CleanerManager = require("./creep.cleaner");
const MineralMinerManager = require("./creep.mineralMiner");

const ClaimerManager = require("./creep.claimer");
const ColonizerBuilderManager = require("./creep.colonizerBuilder");
const ColonizerDefenderManager = require("./creep.colonizerDefender");

// Mapping
const { roles, pathSets, INTERRUPT_PATHING_COST } = require("./constants");
const creepRoleMap = {
    [roles.hauler]: new HaulerManager(),
    [roles.starterHauler]: new StarterHaulerManager(),
    [roles.miner]: new MinerManager(),
    [roles.upgrader]: new UpgraderManager(),
    [roles.scout]: new ScoutManager(),
    [roles.repairer]: new RepairerManager(),
    [roles.builder]: new BuilderManager(),
    [roles.reserver]: new ReserverManager(),
    [roles.defender]: new DefenderManager(),
    [roles.cleaner]: new CleanerManager(),
    [roles.mineralMiner]: new MineralMinerManager(),

    [roles.claimer]: new ClaimerManager(),
    [roles.colonizerBuilder]: new ColonizerBuilderManager(),
    [roles.colonizerDefender]: new ColonizerDefenderManager(),
};

// Economy
const SpawnManager = require("./spawn.spawnManager");
const spawnManager = new SpawnManager();
const { checkRCL } = require("./manager.RCLManager");

const RemoteManager = require("./remote.remoteManager");
const remoteManager = new RemoteManager();

// Base planning
const BasePlanner = require("./base.basePlanner");
const basePlanner = new BasePlanner();
const { getPlan: getBasePlan } = require("./base.planningUtility");
const { handleSites } = require("./base.constructionManager");

// Auto expansion
const { showAppraisalScores } = require("./debug.expansionDebugUtility");
const ExpansionManager = require("./expansion.expansionManager");
const expansionManager = new ExpansionManager();

// Missions
const { showMissionTargets } = require("./combat.missionDebug");
const MissionManager = require("./combat.missionManager");
const missionManager = new MissionManager();

// Defense
const DefenseManager = require("./manager.defenseManager");
const defenseManager = new DefenseManager();
const { restoreSKMatrices } = require("./scouting.scoutingUtility");

// Hauling
const HaulingRequester = require("./manager.haulingRequestManager");
const haulingRequester = new HaulingRequester();

// Stats and Debug
const overlay = require("./debug.overlay");
const trackStats = require("./debug.trackStats");
const profiler = require("./debug.profiler");

const generatePixels = () => {
    // Since this mechanic is disabled on all servers except MMO,
    // we'll want to check if it's possible first
    if (Game.cpu.generatePixel) {
        if (Game.cpu.bucket >= 10000) {
            Game.cpu.generatePixel();
        }
    }
};

const runExpansion = () => {
    expansionManager.run();
    if (DEBUG.showAppraisalScores) {
        showAppraisalScores();
    }
};

const runMissions = () => {
    missionManager.runGlobally();
    if (DEBUG.showMissionTargets) {
        showMissionTargets();
    }
};

const runColonies = () => {
    // Initialize our colonies
    for (const room in Game.rooms) {
        if (!Game.rooms[room].controller || !Game.rooms[room].controller.my) {
            continue;
        }
        if (!colonies[room]) {
            colonies[room] = new Colony(Game.rooms[room]);
        }

        const colony = colonies[room];

        // We won't be able to proceed without a base plan
        if (!getBasePlan(colony.room.name)) {
            basePlanner.generateNewRoomPlan(colony);
            continue;
        }

        // Initialize now that we know we're able to
        profiler.wrap("initialize colony", () => colony.initializeTickInfo());

        // We'll also want a spawn before we can do anything if this is a new colony
        if (!colony.structures[STRUCTURE_SPAWN]) {
            profiler.wrap("construction", () => handleSites(colony));
            continue;
        }

        // Initialize our panels for this room
        profiler.wrap("setup overlay", () =>
            overlay
                .createPanel(colony.room.name, colony.room.name, "tl")
                .addChild(colony.room.name + "_a")
                .addChild(colony.room.name + "_b")
        );
        overlay.addHeading(colony.room.name, colony.room.name);

        // Run RCL level up events if we've leveled up
        checkRCL(colony);

        // Planning stuff
        if (DEBUG.replanBaseOnReload && RELOAD) {
            basePlanner.generateNewRoomPlan(colony);
        }
        profiler.wrap("construction", () => handleSites(colony));
        if (RELOAD) {
            cachePathMatrix(
                generateDefaultPathMatrix(colony.room.name),
                pathSets.default,
                colony.room.name
            );
            restoreSKMatrices();
        }
        if (DEBUG.visualizeBasePlan) {
            basePlanner.visualizePlan(colony.room.name);
        }

        // Track RCL progress
        if (DEBUG.trackRCLProgress) {
            overlay.addHeading(colony.room.name + "_b", "RCL");
            const averageRCL = trackStats.trackRCL(
                colony.room.name,
                DEBUG.statsPeriodLength
            );
            overlay.addText(colony.room.name + "_b", {
                "RCL Per Tick": averageRCL.toFixed(3),
            });
            const neededEnergyToNextRCL =
                colony.room.controller.progressTotal -
                colony.room.controller.progress;
            const ticksUntilNextRCL = Math.floor(
                neededEnergyToNextRCL / averageRCL
            );
            overlay.addText(colony.room.name + "_b", {
                "Next RCL In": ticksUntilNextRCL,
            });
        }

        // Defense
        profiler.wrap("defense", () => defenseManager.run(colony));

        // Hauling requests
        profiler.wrap("hauling", () =>
            haulingRequester.generateBasicRequests(colony)
        );

        // Handle economy (spawns and remotes)
        profiler.wrap("remotes", () => remoteManager.run(colony));
        profiler.wrap("spawns", () => spawnManager.run(colony));

        if (DEBUG.drawPathMatrices || DEBUG.drawWorkingPositions) {
            const matrix = DEBUG.drawPathMatrices
                ? getCachedPathMatrix(pathSets.default, colony.room.name)
                : new PathFinder.CostMatrix();
            const excludedValues = DEBUG.drawPathMatrices ? [] : [0];
            if (DEBUG.drawWorkingPositions) {
                const workPositions = getWorkingPositions(colony.room.name);
                for (const cached of workPositions) {
                    matrix.set(
                        cached.pos.x,
                        cached.pos.y,
                        INTERRUPT_PATHING_COST
                    );
                }
            }
            overlay.visualizeCostMatrix(
                colony.room.name,
                matrix,
                excludedValues
            );
        }
    }
};

const runCreeps = () => {
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        const role = Memory.creeps[name].role;
        if (!creep) {
            if (creepRoleMap[role]) {
                creepRoleMap[role].freeCreep(name);
            }
            delete Memory.creeps[name];
            continue;
        }

        // Skip haulers until the end
        if (creep.memory.role === roles.hauler) {
            continue;
        }

        // Map the creep's role to its appropriate manager and run behaviour
        if (creepRoleMap[creep.memory.role]) {
            profiler.wrap(creep.memory.role, () =>
                creepRoleMap[creep.memory.role].processCreep(
                    creep,
                    colonies[creep.memory.home]
                )
            );
        } else {
            creep.say("Missing");
        }
    }

    // We'll process all haulers after ordinary creeps, in case other creeps created orders this tick
    for (const colony of Object.values(colonies)) {
        // Cleanup orders for this tick before running haulers
        colony.finalizeRequests();
        for (const hauler of colony.haulers) {
            profiler.wrap(hauler.memory.role, () =>
                creepRoleMap[hauler.memory.role].processCreep(hauler, colony)
            );
        }
    }
};

const runTraffic = () => {
    // After all creeps have been processed, let's sort out the traffic
    for (const room of Object.values(Game.rooms)) {
        const costs =
            getCachedPathMatrix(pathSets.default, room.name) ||
            new PathFinder.CostMatrix();
        profiler.wrap(room.name, () => harabiTrafficManager.run(room, costs));
    }
};

//#region Stats

const stats_trackCPU = () => {
    const rollingAverage = trackStats.trackCPU(DEBUG.statsPeriodLength);
    for (const roomName in colonies) {
        overlay.addHeading(roomName, "CPU Usage");
        overlay.addText(roomName, {
            "Average CPU": rollingAverage.toFixed(3),
            "Last CPU": Game.cpu.getUsed().toFixed(3),
        });
    }
};

const stats_trackHeap = () => {
    const heapData = Game.cpu.getHeapStatistics();
    const heapUsage =
        ((heapData.total_heap_size + heapData.externally_allocated_size) /
            heapData.heap_size_limit) *
        100;
    for (const roomName in colonies) {
        overlay.addHeading(roomName, "Heap Usage");
        overlay.addText(roomName, {
            "Last Heap": heapUsage.toFixed(2) + "%",
        });
    }
};

const stats_trackCreeps = () => {
    for (const roomName in colonies) {
        overlay.addHeading(roomName + "_a", "Creeps");

        // Unfortunate O(n^2) computation here
        for (const rn in colonies) {
            overlay.addColumns(roomName + "_a", rn, colonies[rn].creeps.length);
        }
        overlay.addColumns(
            roomName + "_a",
            "Total",
            Object.values(Game.creeps).length
        );
    }
};

// #endregion Stats

const mainLoop = () => {
    // Memhack can save us a ton of CPU on memory serialization costs
    doMemhack();

    // Passive pixel generation
    if (DEBUG.generatePixels) {
        generatePixels();
    }

    // If we're running the profiler, let's track our memory deserialization separately
    // by forcing it to deserializng before we run any meaningful code and tracking the cost here
    if (DEBUG.runProfiler) profiler.wrap("deserialize memory", () => Memory);

    // Global expansion-related things should come first so colonies know how to react
    profiler.wrap("expansion", runExpansion);

    // Colonies will then run any logic required for creep actions like creating hauler orders
    profiler.wrap("colonies", runColonies);

    // Then creeps will take action based on each colony's activity
    profiler.wrap("creeps", runCreeps);

    // Finally, we'll want to sort out traffic for all of our creeps
    profiler.wrap("traffic", runTraffic);

    // Diagnostics things (skip during reload to prevent innacurrate results)
    if (!RELOAD) {
        if (DEBUG.trackCPUUsage) stats_trackCPU();
        if (DEBUG.profileHeapUsage) stats_trackHeap();
        if (DEBUG.trackCreepCounts) stats_trackCreeps();
    }

    profiler.printout();
    overlay.finalizePanels();

    // If we reloaded
    global.RELOAD = false;
};

module.exports.loop = mainLoop;
