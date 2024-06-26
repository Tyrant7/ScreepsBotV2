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

    trackCPUUsage: true,
    trackRCLProgress: true,
    trackCreepCounts: true,
    trackActiveRemotes: true,
    trackSpawnUsage: true,

    logRemotePlanning: true,
    logRemoteDropping: true,
    replanRemotesOnReload: false,

    runProfiler: true,
    profilerPrintoutInterval: 1,
    profileHeapUsage: true,

    visualizeBasePlan: false,
    replanBaseOnReload: false,
    validateBasePlans: true,
    testBasePlanSerialization: true,
    cpuPrintoutFigures: 4,
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

// Data
const RoomInfo = require("./data.roomInfo");
const roomInfos = {};

// Managers
const EconomyManager = require("./manager.economyManager");
const TowerManager = require("./manager.towerManager");

// Creeps
const HaulerManager = require("./creep.hauler");
const MinerManager = require("./creep.miner");
const UpgraderManager = require("./creep.upgrader");
const ScoutManager = require("./creep.scout");
const RepairerManager = require("./creep.repairer");
const BuilderManager = require("./creep.builder");
const ReserverManager = require("./creep.reserver");
const DefenderManager = require("./creep.defender");
const MineralMinerManager = require("./creep.mineralMiner");

// Mapping
const { roles, pathSets, INTERRUPT_PATHING_COST } = require("./constants");
const creepRoleMap = {
    [roles.hauler]: new HaulerManager(),
    [roles.miner]: new MinerManager(),
    [roles.upgrader]: new UpgraderManager(),
    [roles.scout]: new ScoutManager(),
    [roles.repairer]: new RepairerManager(),
    [roles.builder]: new BuilderManager(),
    [roles.reserver]: new ReserverManager(),
    [roles.defender]: new DefenderManager(),
    [roles.mineralMiner]: new MineralMinerManager(),
};

// Economy
const economyManager = new EconomyManager();

// Base planning
const BasePlanner = require("./base.basePlanner");
const basePlanner = new BasePlanner();
const { getPlan: getBasePlan } = require("./base.planningUtility");
const { handleSites } = require("./base.constructionManager");

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
        profiler.wrap("initialize colony", () =>
            roomInfos[room].initializeTickInfo()
        );
        const info = roomInfos[room];

        // Initialize our panels for this room
        profiler.wrap("setup overlay", () =>
            overlay
                .createPanel(info.room.name, "tl")
                .addChild(info.room.name + "0")
                .addChild(info.room.name + "1")
        );

        if (
            !getBasePlan(info.room.name) ||
            (DEBUG.replanBaseOnReload && RELOAD)
        ) {
            basePlanner.generateNewRoomPlan(info);
        }
        profiler.wrap("construction", () => handleSites(info));
        if (RELOAD) {
            cachePathMatrix(
                generateDefaultPathMatrix(info.room.name),
                pathSets.default,
                info.room.name
            );
        }
        if (DEBUG.visualizeBasePlan) {
            basePlanner.visualizePlan(info.room.name);
        }

        // Track RCL progress
        if (DEBUG.trackRCLProgress) {
            overlay.addHeading(info.room.name + "1", "RCL");
            const averageRCL = trackStats.trackRCL(info.room.name);
            overlay.addText(info.room.name + "1", {
                "RCL Per Tick": averageRCL.toFixed(3),
            });
            const neededEnergyToNextRCL =
                info.room.controller.progressTotal -
                info.room.controller.progress;
            const ticksUntilNextRCL = Math.floor(
                neededEnergyToNextRCL / averageRCL
            );
            overlay.addText(info.room.name + "1", {
                "Next RCL In": ticksUntilNextRCL,
            });
        }

        // Defense
        profiler.wrap("towers", () => towerManager.run(info));

        // Hauling requests
        profiler.wrap("hauling", () =>
            haulingRequester.generateBasicRequests(info)
        );

        // Handle economy (remotes and spawns)
        profiler.wrap("economy", () => economyManager.run(info));

        if (DEBUG.drawPathMatrices || DEBUG.drawWorkingPositions) {
            const matrix = DEBUG.drawPathMatrices
                ? getCachedPathMatrix(pathSets.default, info.room.name)
                : new PathFinder.CostMatrix();
            const excludedValues = DEBUG.drawPathMatrices ? [] : [0];
            if (DEBUG.drawWorkingPositions) {
                const workPositions = getWorkingPositions(info.room.name);
                for (const cached of workPositions) {
                    matrix.set(
                        cached.pos.x,
                        cached.pos.y,
                        INTERRUPT_PATHING_COST
                    );
                }
            }
            overlay.visualizeCostMatrix(info.room.name, matrix, excludedValues);
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
                        roomInfos[creep.memory.home]
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
    for (const info of Object.values(roomInfos)) {
        for (const hauler of info.haulers) {
            profiler.wrap(hauler.memory.role, () =>
                creepRoleMap[hauler.memory.role].processCreep(hauler, info)
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
        for (const roomName in roomInfos) {
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
        for (const roomName in roomInfos) {
            overlay.addHeading(roomName + "0", "Creeps");
            overlay.addText(roomName + "0", {
                Count: Object.values(Memory.creeps).length,
            });
        }
    }

    profiler.printout(DEBUG.profilerPrintoutInterval);

    // Finalize overlays
    for (const roomName in roomInfos) {
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
