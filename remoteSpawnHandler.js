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

        // Iterate through each until we find one under its spawn requirements
        for (const remote of remotes) {
            const spawn = this.getBestSpawn(roomInfo.room.energyCapacityAvailable, remote.haulerPaths.length, remote.neededHaulerCarry);
            if (spawn) {
                return spawn;
            }
        }
    }

    getBestSpawn(maxCost, sourceCount, neededCarry) {

        // Compare ideal with actual
        // Need some way of knowing how many have already been spawned

        // Start with miners
        const miners = [];
        for (let i = 0; i < sourceCount; i++) {
            miners.push(this.makeMiner(maxCost));
        }

        // Haulers next
        // Keep making haulers until we have enough to transport all energy we'll mine
        const haulers = [];
        while (neededCarry > 0) {
            const hauler = this.makeHauler(neededCarry, maxCost);
            neededCarry -= hauler.body.filter((p) => p === CARRY).length;
            haulers.push(hauler);
        }

        // Workers -> just one for repairs
        const workers = [];
        workers.push(this.makeWorker(CONSTANTS.maxRemoteBuilderLevel, maxCost));

        // Finally, claimers -> just one per remote
        const claimerBody = this.makeReserver().body;
    }

    makeWorker(desiredLevel, maxCost) {
        return workerSpawnHandler.make(desiredLevel, maxCost);
    }

    makeReserver() {
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
        return haulerSpawnHandler.make(Math.min(Math.ceil(carryParts / 2), CONSTANTS.maxRemoteHaulerLevel), maxCost);
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

        // Builders -> just one for repairs
        const builders = [];
        builders.push(this.makeBuilder(CONSTANTS.maxRemoteBuilderLevel, maxCost));
        upkeeps.energy += calculateUpkeep(builders, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(builders, creepSpawnUtility.getSpawnTime);

        // Finally, claimers
        const claimerBody = this.makeReserver().body;
        upkeeps.energy += creepSpawnUtility.getCost(claimerBody) / CREEP_CLAIM_LIFE_TIME;
        upkeeps.spawnTime += creepSpawnUtility.getSpawnTime(claimerBody) / CREEP_CLAIM_LIFE_TIME;

        return upkeeps;
    }

    getTotalAvgSpawnTime(roomInfo) {

    }
}

module.exports = RemoteSpawnHandler;