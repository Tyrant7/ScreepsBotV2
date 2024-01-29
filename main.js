/*

Tyrant Bot V2

*/

// Globals
global.CONSTANTS = require("constants");
global.DEBUG = {
    logTasks: true,
    drawOverlay: true,
    trackCPUUsage: true,
};

// Managers
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");
const TowerManager = require("towerManager");
const RemoteManager = require("remoteManager");

// Data
const RoomInfo = require("roomInfo");

// Tasks
const WorkerTaskGenerator = require("workerTaskGenerator");
const HaulerTaskGenerator = require("haulerTaskGenerator");
const MinerTaskGenerator = require("minerTaskGenerator");
const ScoutTaskGenerator = require("scoutTaskGenerator");

const workerManager = new CreepManager(new WorkerTaskGenerator());
const haulerManager = new CreepManager(new HaulerTaskGenerator());
const minerManager = new CreepManager(new MinerTaskGenerator());
const scoutManager = new CreepManager(new ScoutTaskGenerator());

// Spawning
const spawnManager = new SpawnManager();

const CrashSpawnHandler = require("crashSpawnHandler");
const WorkerSpawnHandler = require("workerSpawnHandler");
const MinerSpawnHandler = require("minerSpawnHandler");
const HaulerSpawnHandler = require("haulerSpawnHandler");
const ScoutSpawnHandler = require("scoutSpawnHandler");

const crashSpawnHandler = new CrashSpawnHandler();
const workerSpawnHandler = new WorkerSpawnHandler();
const minerSpawnHandler = new MinerSpawnHandler();
const haulerSpawnHandler = new HaulerSpawnHandler();
const scoutSpawnHandler = new ScoutSpawnHandler();

// Only include economy based spawn handlers,
// and do not include handlers that are not meant to regularly spawn in bases
// such as the crashSpawnHandler which only handles recovery cases
const basicSpawnHandlers = [
    minerSpawnHandler, // To not waste source energy
    haulerSpawnHandler, // To recover quickly
    workerSpawnHandler, // To use the energy
    scoutSpawnHandler, // To expand
];

// Defense
const towerManager = new TowerManager();

// Remote
const remoteManager = new RemoteManager();

// Overlay
const overlay = require("overlay");

// Mapping
const creepRoleMap = {
    [CONSTANTS.roles.worker]: workerManager,
    [CONSTANTS.roles.hauler]: haulerManager,
    [CONSTANTS.roles.miner]: minerManager,
    [CONSTANTS.roles.scout]: scoutManager,
};

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
        roomInfos[room] = new RoomInfo(Game.rooms[room]);
        const info = roomInfos[room];

        // Don't try to spawn in rooms that aren't ours
        if (info.spawns && info.spawns.length) {

            // Handle spawns
            // Spawn handlers are passed in order of priority
            spawnManager.run(info, [
                crashSpawnHandler, // For bare necessities
                ...basicSpawnHandlers,
            ]);

            // This represent the fraction of our total spawn capacity we sit at
            // i.e. the amount of time we spend spawning / 1
            const avgSustainCost = basicSpawnHandlers.reduce((total, curr) => total + curr.getTotalAvgSpawnTime(info), 0) / info.spawns.length;
            overlay.text(info.room, { "Spawn Capacity": avgSustainCost + " / 1" });

            // Plan remotes for bases!
            try {
                remoteManager.run(info, CONSTANTS.maxBaseSpawnCapacity - avgSustainCost);
            }
            catch(e) {
                console.log("remoteManager encountered error: " + e);
            }
        }

        // Defense
        towerManager.run(info);
    }

    // Run creeps
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        if (creep) {

            // Map the creep's role to its appropriate manager and run behaviour
            if (creepRoleMap[creep.memory.role]) {
                creepRoleMap[creep.memory.role].processCreep(creep, roomInfos[creep.memory.home]);
            }
            else {
                creep.say("??");
            }
        }
        else {
            creepDeath(name);
        }
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