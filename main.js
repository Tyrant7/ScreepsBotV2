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

    // Let's make sure some essential objects are initialized
    if (!Memory.rooms) {
        Memory.rooms = {};
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

            // Spawn handlers are passed in order of priority
            // Add more spawn handlers to this for each role, 
            // do not include handlers that are not meant to regularly spawn 
            // such as the crashSpawnHandler which only handles recovery cases
            const basicSpawnHandlers = [
                minerSpawnHandler, // To not waste source energy
                haulerSpawnHandler, // To recover quickly
                workerSpawnHandler, // To use the energy
                scoutSpawnHandler, // To expand
            ];

            spawnManager.run(info, [
                crashSpawnHandler, // For bare necessities
                ...basicSpawnHandlers,
            ]);

            // This represent the fraction of our total spawn capacity we sit at
            // i.e. the amount of time we spend spawning / 1
            const avgSustainCost = basicSpawnHandlers.reduce((total, curr) => total + curr.getTotalAvgSpawnTime(info), 0) / info.spawns.length;
            if (DEBUG.drawOverlay) {
                overlay.text(info.room, { "Spawn Capacity": avgSustainCost + " / 1" });
            }
        }

        // Defense
        towerManager.run(info);
    }

    // Plan remotes
    for (const room in Game.rooms) {
        const info = roomInfos[room];
        if (info.spawns && info.spawns.length) {

            const avgSustainCost = 0.278;

            if (Game.time % 3 === 0) {
                const cpu = Game.cpu.getUsed();
                const bestBranch = remotePlanner.planRemotes(info, 0.6 - avgSustainCost);

                if (!bestBranch) {
                    break;
                }

                const allRoads = bestBranch.branch.reduce((roads, node) => roads.concat(node.roads), []);

                // Save some info for the best branch to memory
                Memory.temp = {};
                Memory.temp.roads = allRoads.map((road) => { 
                    return { x: road.x, y: road.y, roomName: road.roomName }; 
                });

                console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
                bestBranch.branch.forEach((b) => console.log("Room " + b.name + " with score: " + b.score + " and cost: " + b.cost));
            }
            if (Memory.temp.roads) {

                const roomVisuals = {};
                Memory.temp.roads.forEach((road) => {
                    if (!roomVisuals[road.roomName]) {
                        roomVisuals[road.roomName] = new RoomVisual(road.roomName);
                    }
                    roomVisuals[road.roomName].circle(road.x, road.y);
                });
            }
        }
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