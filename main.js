/*

Tyrant Bot V2

*/

global.CONSTANTS = require("constants");

const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");

const RoomInfo = require("roomInfo");

const WorkerTaskGenerator = require("workerTaskGenerator");
const MinerTaskGenerator = require("minerTaskGenerator");

const workerManager = new CreepManager(new WorkerTaskGenerator());
const minerManager = new CreepManager(new MinerTaskGenerator());
const spawnManager = new SpawnManager();

const creepRoleMap = {
    [CONSTANTS.roles.worker]: workerManager,
    [CONSTANTS.roles.miner]: minerManager,
};

module.exports.loop = function() {

    // Passive pixel generation
    // Disable on private server
    /*
    if (Game.cpu.bucket >= 10000) {
        Game.cpu.generatePixel();
    }
    */

    for (const room in Game.rooms) {
        const info = new RoomInfo(Game.rooms[room]);
        spawnManager.run(info);

        // Initialize tasks for all creep types in the current room
        for (const manager in creepRoleMap) {
            creepRoleMap[manager].initializeTasks(info);
        }
    }

    // Run creeps
    for (const name in Memory.creeps) {
        const creep = Game.creeps[name];
        if (creep) {
            // Map the creep's role to its appropriate manager and run behaviour
            creepRoleMap[creep.memory.role].processCreep(creep);
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