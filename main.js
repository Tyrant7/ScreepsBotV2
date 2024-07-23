/*

Tyrant Bot V2

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
if (!Memory.newColonies) {
    Memory.newColonies = {};
}

// Globals
global.ME = "Tyrant7";
global.DEBUG = {
    logTasks: true,
    alertOnIdle: false,

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

    logRemotePlanning: false,
    logRemoteDropping: false,
    replanRemotesOnReload: false,

    runProfiler: false,
    profileHeapUsage: true,

    visualizeBasePlan: false,
    replanBaseOnReload: false,
    validateBasePlans: true,
    testBasePlanSerialization: true,
    cpuPrintoutFigures: 4,

    logAppraisal: false,
    logColonization: true,
    showAppraisalScores: true,
    showExpansionTargets: true,
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

// Data
const Colony = require("./data.colony");
const colonies = {};

// Managers
const EconomyManager = require("./manager.economyManager");
const TowerManager = require("./manager.towerManager");

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
const MineralMinerManager = require("./creep.mineralMiner");

const ClaimerManager = require("./creep.claimer");
const ColonizerBuilderManager = require("./creep.colonizerBuilder");
const ColonizerHaulerManager = require("./creep.colonizerHauler");

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
    [roles.mineralMiner]: new MineralMinerManager(),

    [roles.claimer]: new ClaimerManager(),
    [roles.colonizerBuilder]: new ColonizerBuilderManager(),
    [roles.colonizerHauler]: new ColonizerHaulerManager(),
};

// Economy
const economyManager = new EconomyManager();
const { checkRCL } = require("./manager.RCLManager");

// Base planning
const BasePlanner = require("./base.basePlanner");
const basePlanner = new BasePlanner();
const { getPlan: getBasePlan } = require("./base.planningUtility");
const { handleSites } = require("./base.constructionManager");

// Auto expansion
const {
    showAppraisalScores,
    showExpansionTargets,
} = require("./debug.expansionDebugUtility");
const ExpansionManager = require("./expansion.expansionManager");
const expansionManager = new ExpansionManager();

// Defense
const towerManager = new TowerManager();

// Hauling
const HaulingRequester = require("./manager.haulingRequestManager");
const haulingRequester = new HaulingRequester();

// Stats and Debug
const overlay = require("./debug.overlay");
const trackStats = require("./debug.trackStats");
const profiler = require("./debug.profiler");

module.exports.loop = function () {
    // Passive pixel generation
    // Disabled on most servers
    if (Game.cpu.generatePixel) {
        if (Game.cpu.bucket >= 10000) {
            Game.cpu.generatePixel();
        }
    }

    // Global expansion-related things should come first so colonies know how to react
    expansionManager.run();
    if (DEBUG.showAppraisalScores) {
        showAppraisalScores();
    }
    if (DEBUG.showExpansionTargets) {
        showExpansionTargets();
    }

    // Initialize our colonies
    for (const room in Game.rooms) {
        if (!Game.rooms[room].controller || !Game.rooms[room].controller.my) {
            continue;
        }
        if (!colonies[room]) {
            colonies[room] = new Colony(Game.rooms[room]);
        }
        profiler.wrap("initialize colony", () =>
            colonies[room].initializeTickInfo()
        );
        const colony = colonies[room];

        // Initialize our panels for this room
        profiler.wrap("setup overlay", () =>
            overlay
                .createPanel(colony.room.name, "tl")
                .addChild(colony.room.name + "0")
                .addChild(colony.room.name + "1")
        );

        // Run RCL level up events if we've leveled up
        checkRCL(colony);

        // Planning stuff
        if (
            !getBasePlan(colony.room.name) ||
            (DEBUG.replanBaseOnReload && RELOAD)
        ) {
            basePlanner.generateNewRoomPlan(colony);
        }
        profiler.wrap("construction", () => handleSites(colony));
        if (RELOAD) {
            cachePathMatrix(
                generateDefaultPathMatrix(colony.room.name),
                pathSets.default,
                colony.room.name
            );
        }
        if (DEBUG.visualizeBasePlan) {
            basePlanner.visualizePlan(colony.room.name);
        }

        // Track RCL progress
        if (DEBUG.trackRCLProgress) {
            overlay.addHeading(colony.room.name + "1", "RCL");
            const averageRCL = trackStats.trackRCL(colony.room.name);
            overlay.addText(colony.room.name + "1", {
                "RCL Per Tick": averageRCL.toFixed(3),
            });
            const neededEnergyToNextRCL =
                colony.room.controller.progressTotal -
                colony.room.controller.progress;
            const ticksUntilNextRCL = Math.floor(
                neededEnergyToNextRCL / averageRCL
            );
            overlay.addText(colony.room.name + "1", {
                "Next RCL In": ticksUntilNextRCL,
            });
        }

        // Defense
        profiler.wrap("towers", () => towerManager.run(colony));

        // Hauling requests
        profiler.wrap("hauling", () =>
            haulingRequester.generateBasicRequests(colony)
        );

        // Handle economy (remotes and spawns)
        profiler.wrap("economy", () => economyManager.run(colony));

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

    // Run creeps
    profiler.startSample("creeps");
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        if (creep) {
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
        } else {
            creepDeath(name);
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
    profiler.endSample("creeps");

    // After all creeps have been processed, let's sort out the traffic
    profiler.startSample("traffic");
    for (const room of Object.values(Game.rooms)) {
        const costs =
            getCachedPathMatrix(pathSets.default, room.name) ||
            new PathFinder.CostMatrix();
        profiler.wrap(room.name, () => harabiTrafficManager.run(room, costs));
    }
    profiler.endSample("traffic");

    // Track CPU usage
    // (don't track reload because it leads to innacurate averages which take a long time to equalize)
    if (!RELOAD) {
        const rollingAverage = trackStats.trackCPU();
        const heapData = Game.cpu.getHeapStatistics();
        const heapUsage =
            ((heapData.total_heap_size + heapData.externally_allocated_size) /
                heapData.heap_size_limit) *
            100;
        for (const roomName in colonies) {
            if (DEBUG.trackCPUUsage) {
                overlay.addHeading(roomName, "CPU Usage");
                overlay.addText(roomName, {
                    "Average CPU": rollingAverage.toFixed(3),
                    "Last CPU": Game.cpu.getUsed().toFixed(3),
                });
            }
            if (DEBUG.profileHeapUsage) {
                overlay.addHeading(roomName, "Heap Usage");
                overlay.addText(roomName, {
                    "Last Heap": heapUsage.toFixed(2) + "%",
                });
            }
        }
    }

    // Track creeps
    if (DEBUG.trackCreepCounts) {
        for (const roomName in colonies) {
            overlay.addHeading(roomName + "0", "Creeps");
            overlay.addText(roomName + "0", {
                Count: Object.values(Memory.creeps).length,
            });
        }
    }

    profiler.printout();

    // Finalize overlays
    for (const roomName in colonies) {
        overlay.finalizePanels(roomName);
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
