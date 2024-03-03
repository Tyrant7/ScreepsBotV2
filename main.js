/*

Tyrant Bot V2

*/

// Globals
global.CONSTANTS = require("constants");
global.DEBUG = {
    logTasks: true,
    drawOverlay: true,
    drawRoadOverlay: true,
    drawPathOverlay: true,
    drawContainerOverlay: true,
    trackSpawnUsage: true,
    trackCPUUsage: true,
    trackRCLProgress: true,
    logRemotePlanning: false,
    runProfiler: false,
};

// Managers
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");
const TowerManager = require("towerManager");
const RemoteManager = require("remoteManager");
const ColonyConstructionManager = require("colonyConstructionManager");

// Data
const RoomInfo = require("roomInfo");

// Tasks
const WorkerTaskGenerator = require("workerTaskGenerator");
const HaulerTaskGenerator = require("haulerTaskGenerator");
const MinerTaskGenerator = require("minerTaskGenerator");
const UpgraderTaskGenerator = require("upgraderTaskGenerator");
const ScoutTaskGenerator = require("scoutTaskGenerator");

const RemoteBuilderTaskGenerator = require("remoteBuilderTaskGenerator");
const ReserverTaskGenerator = require("reserverTaskGenerator");
const RemoteMinerTaskGenerator = require("remoteMinerTaskGenerator");
const RemoteHaulerTaskGenerator = require("remoteHaulerTaskGenerator");

const DefenderTaskGenerator = require("defenderTaskGenerator");

const workerManager = new CreepManager(new WorkerTaskGenerator());
const haulerManager = new CreepManager(new HaulerTaskGenerator());
const minerManager = new CreepManager(new MinerTaskGenerator());
const upgraderTaskGenerator = new CreepManager(new UpgraderTaskGenerator());
const scoutManager = new CreepManager(new ScoutTaskGenerator());

const remoteBuilderManager = new CreepManager(new RemoteBuilderTaskGenerator());
const reserverManager = new CreepManager(new ReserverTaskGenerator());
const remoteMinerManager = new CreepManager(new RemoteMinerTaskGenerator());
const remoteHaulerManager = new CreepManager(new RemoteHaulerTaskGenerator());

const defenderManager = new CreepManager(new DefenderTaskGenerator());

// Mapping
const creepRoleMap = {
    [CONSTANTS.roles.worker]: workerManager,
    [CONSTANTS.roles.hauler]: haulerManager,
    [CONSTANTS.roles.miner]: minerManager,
    [CONSTANTS.roles.upgrader]: upgraderTaskGenerator,
    [CONSTANTS.roles.scout]: scoutManager,
    [CONSTANTS.roles.remoteBuilder]: remoteBuilderManager,
    [CONSTANTS.roles.reserver]: reserverManager,
    [CONSTANTS.roles.remoteMiner]: remoteMinerManager,
    [CONSTANTS.roles.remoteHauler]: remoteHaulerManager,
    [CONSTANTS.roles.defender]: defenderManager,
};

// Spawning
const spawnManager = new SpawnManager();

const CrashSpawnHandler = require("crashSpawnHandler");
const WorkerSpawnHandler = require("workerSpawnHandler");
const MinerSpawnHandler = require("minerSpawnHandler");
const HaulerSpawnHandler = require("haulerSpawnHandler");
const UpgraderSpawnHandler = require("upgraderSpawnHandler");
const ScoutSpawnHandler = require("scoutSpawnHandler");

const RemoteSpawnHandler = require("remoteSpawnHandler");
const DefenderSpawnHandler = require("defenderSpawnHandler");

const crashSpawnHandler = new CrashSpawnHandler();
const workerSpawnHandler = new WorkerSpawnHandler();
const minerSpawnHandler = new MinerSpawnHandler();
const haulerSpawnHandler = new HaulerSpawnHandler();
const upgraderSpawnHandler = new UpgraderSpawnHandler();
const scoutSpawnHandler = new ScoutSpawnHandler();

const remoteSpawnHandler = new RemoteSpawnHandler();
const defenderSpawnHandler = new DefenderSpawnHandler();

// Only include economy based spawn handlers,
// and do not include handlers that are not meant to regularly spawn in bases
// such as the crashSpawnHandler which only handles recovery cases
const basicSpawnHandlers = [
    minerSpawnHandler, // To not waste source energy
    haulerSpawnHandler, // To recover quickly
    upgraderSpawnHandler, // To upgrade
    workerSpawnHandler, // To keep structures and construction intact
    scoutSpawnHandler, // To expand
];

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
        if (info.spawns && info.spawns.length) {

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
            ];
            if (info.remoting) {

                // Plan remotes for bases!
                profiler.startSample("Remotes " + room);
                remoteSustainCost = remoteManager.run(info, remoteSpawnHandler, avgSustainCost);
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

            // Handle construction
            profiler.startSample("Construction " + room);
            constructionManager.run(info);
            profiler.endSample("Construction " + room);
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
                creepRoleMap[creep.memory.role].processCreep(creep, roomInfos[creep.memory.home]);
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
    profiler.printout();

    // Finalize overlays
    for (const info of Object.values(roomInfos)) {
        overlay.finalizePanels(info.room.name);
    }
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