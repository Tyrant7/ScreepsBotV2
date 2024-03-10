// This class will handle our spawning to ensure we revive smoothly after a crash
// It will also ensure some base requirements are met before any other creep types are spawned
const creepSpawnUtility = require("creepSpawnUtility");
const WorkerSpawnHandler = require("workerSpawnHandler");
const HaulerSpawnHandler = require("haulerSpawnHandler");

const workerSpawnHandler = new WorkerSpawnHandler();
const haulerSpawnHandler = new HaulerSpawnHandler();

class CrashSpawnHandler {

    getNextSpawn(roomInfo) {
        
        // Let's ensure our colony has met some basic requirements before spawning additional creeps

        // If we have a miner already, let's spawn a hauler to restock quickly
        if (roomInfo.miners.length > 0 && 
            roomInfo.haulers.length < 1) {

            // Make sure we can afford any hauler at all
            const energy = roomInfo.workers.length < 2 ? roomInfo.room.energyAvailable : roomInfo.room.energyCapacityAvailable; 
            const hauler = haulerSpawnHandler.make(CONSTANTS.maxHaulerlevel, energy);
            if (hauler && hauler.body.length) {
                return hauler;
            }
        }

        // We don't need anything, we should be good to restart now
        if (roomInfo.workers.length >= 2 && roomInfo.haulers.length >= 1) {
            return;
        } 

        // Otherwise, let's spawn one worker with whatever we have, then a miner and a second worker
        if (roomInfo.workers.length < 1) {
            return workerSpawnHandler.make(CONSTANTS.maxWorkerLevel, roomInfo.room.energyAvailable);
        }
        else if (roomInfo.miners.length < 1) {
            const miner = this.makeMiniMiner(roomInfo, roomInfo.room.energyCapacityAvailable / 2);
            if (miner) {
                return miner;
            }
        }

        if (roomInfo.workers.length < 2) {
            return workerSpawnHandler.make(CONSTANTS.maxWorkerLevel, roomInfo.room.energyCapacityAvailable / 2);
        }
    }

    makeMiniMiner(roomInfo, energy) {

        const site = roomInfo.getFirstUnreservedMiningSite(true);
        if (!site) {
            return;
        }

        let body = [MOVE];
        let lvl = 0;
        for (let i = 0; i < 4; i++) {
            lvl++;
            body.push(WORK);
            if (creepSpawnUtility.getCost(body) > energy) {
                lvl--;
                body.pop();
                break;
            }
        }
        return { body: body, 
                 name: "Recovery Miner " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.miner }};
    }
}

module.exports = CrashSpawnHandler;