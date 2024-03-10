const remoteUtility = require("remoteUtility");
const creepSpawnUtility = require("creepSpawnUtility");

const MinerSpawnHandler = require("minerSpawnHandler");
const HaulerSpawnHandler = require("haulerSpawnHandler");
const WorkerSpawnHandler = require("workerSpawnHandler");

const minerSpawnHandler = new MinerSpawnHandler();
const haulerSpawnHandler = new HaulerSpawnHandler();
const workerSpawnHandler = new WorkerSpawnHandler();

class RemoteSpawnHandler {

    getNextSpawn(roomInfo) {

        // Get a prioritized list of remotes
        const remotes = remoteUtility.getRemotePlans(roomInfo.room.name);

        // Let's how much from each remote we've already spawned so we can easily track our demand
        const existingSpawns = {};
        Object.values(CONSTANTS.roles).forEach((key) => {
            existingSpawns[key] = 0;
        });

        for (const creep of roomInfo.creeps) {
            if (creep.memory.isRemote) {
                // Rather inelegant, but it'll do
                // Haulers are measured in CARRY part count instead of creep count
                if (creep.memory.role === CONSTANTS.roles.hauler) {
                    existingSpawns[creep.memory.role] += creep.body.filter((p) => p.type === CARRY).length;
                    continue;
                }
                existingSpawns[creep.memory.role]++;
            }
        }
        
        // Iterate through each until we find one under its spawn requirements
        for (const remoteRoom in remotes) {
            const remote = remotes[remoteRoom];
            const sourceCount = remote.haulerPaths.length;
            const spawn = this.getBestSpawn(roomInfo.room.energyCapacityAvailable, sourceCount, remote.neededHaulerCarry, existingSpawns);
            if (spawn) {

                console.log(Object.values(spawn));

                // Tag this creep so we know it came from remote spawning and can count it against 
                // our spawns here next time we attempt spawning
                spawn.isRemote = true;
                return spawn;
            }
        }
    }

    getBestSpawn(maxCost, sourceCount, neededCarry, existingSpawns) {

        // Compare ideal with actual for each role
        // If we have already spawned more than we need, 
        // let's subtract the amount we have and let it propagate to the next remote

        // Start with miners
        const wantedMiners = sourceCount - existingSpawns[CONSTANTS.roles.miner];
        if (wantedMiners > 0) {
            return this.makeMiner(maxCost);
        }
        existingSpawns[CONSTANTS.roles.miner] -= sourceCount;

        // Haulers next
        // Keep making haulers until we have enough to transport all energy we'll mine
        const wantedCarryParts = neededCarry - existingSpawns[CONSTANTS.roles.hauler];
        if (wantedCarryParts > 0) {
            return this.makeHauler(wantedCarryParts, maxCost);
        }
        existingSpawns[CONSTANTS.roles.hauler] -= neededCarry;

        // Workers -> just one per remote for repairs
        const wantedWorkers = 1 - existingSpawns[CONSTANTS.roles.worker];
        if (wantedWorkers > 0) {
            return this.makeWorker(CONSTANTS.maxWorkerLevel, maxCost);
        }
        existingSpawns[CONSTANTS.roles.worker] -= 1;

        const wantedClaimers = 1 - existingSpawns[CONSTANTS.roles.claimer];
        if (wantedClaimers > 0) {
            return this.makeClaimer();
        }
        existingSpawns[CONSTANTS.roles.claimer] -= 1;
    }

    makeWorker(desiredLevel, maxCost) {
        return workerSpawnHandler.make(desiredLevel, maxCost);
    }

    makeClaimer() {
        // Reservers will be made up of 2 CLAIM 2 MOVE bodies
        // It's technically possible with 1 CLAIM 1 MOVE, but give it extra to account for 
        // imperfections in pathing and spawning priorities
        return {
            body: [MOVE, MOVE, CLAIM, CLAIM],
            name: "Reserver " + Game.time + " [2]",
            memory: { role: CONSTANTS.roles.reserver },
        };
    }

    makeMiner(maxCost) {
        return minerSpawnHandler.make(maxCost);
    }

    makeHauler(carryParts, maxCost) {
        return haulerSpawnHandler.make(Math.min(Math.ceil(carryParts / 2), CONSTANTS.maxHaulerLevel), maxCost);
    }

    getUpkeepEstimates(homeRoomInfo, sourceCount, neededCarry) {

        function calculateUpkeep(creeps, calculation) {
            return creeps.reduce((total, curr) => total + calculation(curr.body), 0) / CREEP_LIFE_TIME;
        }

        // Let's get some basic upkeep costs for creeps in this remote
        const upkeeps = { energy: 0, spawnTime: 0 };
        const maxCost = homeRoomInfo.room.energyCapacityAvailable;

        // Start with miners
        const miners = [];
        for (let i = 0; i < sourceCount; i++) {
            miners.push(this.makeMiner(maxCost));
        }
        upkeeps.energy += calculateUpkeep(miners, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(miners, creepSpawnUtility.getSpawnTime);

        // Haulers next
        const haulers = [];
        // Keep making haulers until we have enough to transport all energy we'll mine
        while (neededCarry > 0) {
            const hauler = this.makeHauler(neededCarry, maxCost);
            neededCarry -= hauler.body.filter((p) => p === CARRY).length;
            haulers.push(hauler);
        }
        upkeeps.energy += calculateUpkeep(haulers, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(haulers, creepSpawnUtility.getSpawnTime);

        // Workers -> just one for repairs
        const workers = [];
        workers.push(this.makeWorker(CONSTANTS.maxWorkerLevel, maxCost));
        upkeeps.energy += calculateUpkeep(workers, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(workers, creepSpawnUtility.getSpawnTime);

        // Finally, claimers
        const claimerBody = this.makeClaimer().body;
        upkeeps.energy += creepSpawnUtility.getCost(claimerBody) / CREEP_CLAIM_LIFE_TIME;
        upkeeps.spawnTime += creepSpawnUtility.getSpawnTime(claimerBody) / CREEP_CLAIM_LIFE_TIME;

        return upkeeps;
    }

    getTotalAvgSpawnTime(roomInfo) {

    }
}

module.exports = RemoteSpawnHandler;