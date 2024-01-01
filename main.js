/*

Tyrant Bot V2

*/

global.CONSTANTS = require("constants");
const CreepManager = require("creepManager");
const SpawnManager = require("spawnManager");

const RoomInfo = require("roomInfo");

console.log("bbasdb");


const WorkerTaskGenerator = require("workerTaskGenerator");


console.log("zzzzz");

const MinerTaskGenerator = require("minerTaskGenerator");

console.log("asdfas");

const workerManager = new CreepManager(new WorkerTaskGenerator());
const minerManager = new CreepManager(new MinerTaskGenerator());
const spawnManager = new SpawnManager();

const creepRoleMap = {
    [CONSTANTS.roles.worker]: workerManager,
    [CONSTANTS.roles.miner]: minerManager,
};

module.exports.loop = function() {

    console.log("a");

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

        // Initialize tasks for all creeps
        for (const manager of creepRoleMap) {
            manager.initializeTasks(info);
        }
    }

    // Run creeps
    for (let name in Memory.creeps) {
        if (Game.creeps[name]) {

            // Map the creep's role to its appropriate manager and run behaviour
            const role = Game.creeps[name].memory.role;
            creepRoleMap[role].processCreep(creep);

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
 * Processes the death of a creep to run any cleanup code.
 * @param {string} name The name of the deceased creep.
 */
function creepDeath(name) {

    const role = Memory.creeps[name].role;
    creepRoleMap[role].freeCreep(role);

    delete Memory.creeps[name];
}