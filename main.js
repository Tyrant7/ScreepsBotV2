/*

Tyrant Bot V2

*/

const CONSTANTS = require("constants");
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

function processCreep(creep) {
    if (creep.memory.role === CONSTANTS.roles.worker) {
        workerManager.processWorker(creep);
    }
}

function creepDeath(name) {
    if (Memory.creeps[name].role === CONSTANTS.roles.worker) {
        workerManager.workerDeath(name);
    }
    delete Memory.creeps[name];
}