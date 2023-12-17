/*

Tyrant Bot V2

*/

global.CONSTANTS = require("constants");
const workerManager = require("workerManager");

module.exports.loop = function() {

    // Passive pixel generation
    // Disable on private server
    /*
    if (Game.cpu.bucket >= 10000) {
        Game.cpu.generatePixel();
    }
    */

    // Run creeps
    for (let name in Memory.creeps) {
        if (Game.creeps[name]) {
            processCreep(Game.creeps[name]);
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
        workerManager.workerDeath(name);
    }
    delete Memory.creeps[name];
}