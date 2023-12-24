/*

Tyrant Bot V2

*/

global.CONSTANTS = require("constants");
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");
const WorkerTaskGenerator = require("workerTaskGenerator");

const workerManager = new CreepManager(new WorkerTaskGenerator());
const spawnManager = new SpawnManager();

module.exports.loop = function() {

    // Passive pixel generation
    // Disable on private server
    /*
    if (Game.cpu.bucket >= 10000) {
        Game.cpu.generatePixel();
    }
    */

    for (const room in Game.rooms) {
        const info = new RoomInfo(room);
        spawnManager.run(info);
        workerManager.generateTasks(info);
    }

    // Run creeps
    for (let name in Memory.creeps) {
        if (Game.creeps[name]) {
            processCreep(Game.creeps[name]);

            // Really bad fix for this, but needed to track room of deceased creeps
            if (Game.creeps[name].ticksToLive <= 1) {
                Memory.creeps[name].room = Game.creeps[name].room.name;
            }
            continue;
        }
        creepDeath(name);
    }
}

/**
 * Processes any creep of any type to perform its duties.
 * @param {Creep} creep The creep to process.
 */
function processCreep(creep) {
    if (creep.memory.role === CONSTANTS.roles.worker) {
        workerManager.processWorker(creep);
    }
}

/**
 * Processes the death of a creep to run any cleanup code.
 * @param {string} name The name of the deceased creep.
 */
function creepDeath(name) {
    if (Memory.creeps[name].role === CONSTANTS.roles.worker) {
        workerManager.freeCreep(name);
    }
    delete Memory.creeps[name];
}