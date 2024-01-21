/*

Tyrant Bot V2

*/

// Globals
global.CONSTANTS = require("constants");
global.DEBUG = {
    logTasks: true,
    drawOverlay: true,
};

// Managers
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");
const TowerManager = require("towerManager");

// Data
const RoomInfo = require("roomInfo");

// Remotes
const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

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

// Defense
const towerManager = new TowerManager();

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
            // Spawn handlers are passed in order of priority
            spawnManager.run(info, [
                crashSpawnHandler, // Bare necessities
                minerSpawnHandler, // To not waste source energy
                haulerSpawnHandler, // To recover quickly
                workerSpawnHandler, // To use the energy
                scoutSpawnHandler, // To expand
            ]);
        }

        // Defense
        towerManager.run(info);
    }

    // Plan remotes
    for (const room in Game.rooms) {
        const info = roomInfos[room];
        if (info.spawns && info.spawns.length) {

            // Add more spawn handlers to this for each role, 
            // do not include handlers that are not meant to regularly spawn 
            // such as the crashSpawnHandler which only handles recovery cases
            const spawnHandlers = [minerSpawnHandler,
                                   haulerSpawnHandler,
                                   workerSpawnHandler,
                                   scoutSpawnHandler];

            // This represent the fraction of our total spawn capacity we sit at
            // i.e. the amount of time we spend spawning / 1
            const avgSustainCost = spawnHandlers.reduce((total, curr) => total + curr.getTotalAvgSpawnTime(info), 0) / info.spawns.length;      
            if (DEBUG.drawOverlay) {
                overlay(info.room, { "Spawn Capacity": avgSustainCost + " / 1" });
            }

            if (Game.time % 10 === 0) {
                const exits = Object.values(Game.map.describeExits(info.room.name));
                exits.forEach(exit => {
                    const rem = remotePlanner.scoreRemote(info, exit);
                    if (rem) {
                        console.log("calculating for remote: " + exit + " of " + info.room.name);
                        console.log("score: " + rem.score + " E/t, cost: " + rem.cost + " spawn capacity");
                    }         
                });
            }
        }
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