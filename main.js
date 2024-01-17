/*

Tyrant Bot V2

*/

// Globals
global.CONSTANTS = require("constants");
global.DEBUG = {
    logTasks: false,
};

// Managers
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");
const TowerManager = require("towerManager");

// Data
const RoomInfo = require("roomInfo");

// Tasks
const WorkerTaskGenerator = require("workerTaskGenerator");
const MinerTaskGenerator = require("minerTaskGenerator");
const HaulerTaskGenerator = require("haulerTaskGenerator");

const workerManager = new CreepManager(new WorkerTaskGenerator());
const minerManager = new CreepManager(new MinerTaskGenerator());
const haulerManager = new CreepManager(new HaulerTaskGenerator());

// Spawning
const WorkerSpawnInfo = require("workerSpawnInfo");
const MinerSpawnInfo = require("minerSpawnInfo");
const HaulerSpawnInfo = require("haulerSpawnInfo");
const spawnManager = new SpawnManager();

// Defense
const towerManager = new TowerManager();

// Mapping
const creepRoleMap = {
    [CONSTANTS.roles.worker]: workerManager,
    [CONSTANTS.roles.miner]: minerManager,
    [CONSTANTS.roles.hauler]: haulerManager,
};

module.exports.loop = function() {

    // Passive pixel generation
    // Disable on private server
    /*
    if (Game.cpu.bucket >= 10000) {
        Game.cpu.generatePixel();
    }
    */
    
    // Initialize our info map
    const roomInfos = {};
    for (const room in Game.rooms) {
        roomInfos[room] = new RoomInfo(Game.rooms[room]);
        const info = roomInfos[room];

        spawnManager.run(info, [
            new WorkerSpawnInfo(), 
            new MinerSpawnInfo(), 
            new HaulerSpawnInfo()
        ]);

        // Defense
        towerManager.run(info);
    }

    // Run creeps
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        if (creep) {

            // Map the creep's role to its appropriate manager and run behaviour
            creepRoleMap[creep.memory.role].processCreep(creep, roomInfos[creep.memory.home]);
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
    creepRoleMap[role].freeCreep(name);

    delete Memory.creeps[name];
}