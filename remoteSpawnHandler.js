const creepSpawnUtility = require("creepSpawnUtility");
const MinerSpawnHandler = require("minerSpawnHandler");
const HaulerSpawnHandler = require("haulerSpawnHandler");

const minerSpawnHandler = new MinerSpawnHandler();
const haulerSpawnHandler = new HaulerSpawnHandler();

class RemoteSpawnHandler {

    getNextSpawn(roomInfo) {
        
        // Make sure we have actual spawns for this base
        if (!this.spawnQueues) {
            return;
        }
        const queue = this.spawnQueues[roomInfo.room.name];
        if (!queue || !queue.length) {
            return;
        }

        const next = queue.shift();
        switch (next.role) {
            case CONSTANTS.roles.remoteBuilder:
                return this.makeBuilder(CONSTANTS.maxRemoteBuilderLevel, roomInfo.room.energyCapacityAvailable);
            case CONSTANTS.roles.reserver:
                return this.makeReserver();
            case CONSTANTS.roles.remoteMiner:
                return this.makeMiner(roomInfo.room.energyCapacityAvailable);
            case CONSTANTS.roles.remoteHauler:
                // Haulers are measured in part count, as opposed to creep numbers
                return this.makeHauler(next.count, roomInfo.room.energyCapacityAvailable);
        }
    }

    clearQueues() {
        this.spawnQueues = {};
    }

    queueSpawn(spawnRoomName, role, count) {
        if (!this.spawnQueues[spawnRoomName]) {
            this.spawnQueues[spawnRoomName] = [];
        }
        this.spawnQueues[spawnRoomName].push({ role: role, count: count });
    }

    makeBuilder(desiredLevel, maxCost) {
        const builderParts = [WORK, CARRY, MOVE];
        let body = builderParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < Math.min(desiredLevel, CONSTANTS.maxRemoteBuilderLevel) && (lvl + 1) * levelCost <= maxCost) {
            lvl++;
            body = body.concat(builderParts);
        }
        return { body: body, 
                 name: "Remote Builder " + Game.time + " [" + lvl.toString() + "]",
                 memory: { role: CONSTANTS.roles.remoteBuilder }};
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
        const body = minerSpawnHandler.make(maxCost).body;
        return {
            body: body,
            name: "Remote Miner " + Game.time + " [" + body.filter((p) => p === WORK).length + "]",
            memory: { role: CONSTANTS.roles.remoteMiner }, 
        };
    }

    makeHauler(carryParts, maxCost) {
        const body = haulerSpawnHandler.make(Math.ceil(carryParts / 2), maxCost).body;
        return { body: body, 
                 name: "Remote Hauler " + Game.time + " [" + body.filter((p) => p === MOVE).length + "]",
                 memory: { role: CONSTANTS.roles.remoteHauler }};
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