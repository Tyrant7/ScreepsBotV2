const creepSpawnUtility = require("creepSpawnUtility");
const MinerSpawnHandler = require("minerSpawnHandler");

const minerSpawnHandler = new MinerSpawnHandler();

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
                console.log(next.idealLevel);
                return this.makeBuilder(next.idealLevel, roomInfo.room.energyCapacityAvailable);
            case CONSTANTS.roles.reserver:
                return this.makeReserver();
            case CONSTANTS.roles.remoteMiner:
                return this.makeMiner(roomInfo.room.energyCapacityAvailable);
            case CONSTANTS.roles.remoteHauler:
                return this.makeHauler(next.idealLevel, roomInfo.room.energyCapacityAvailable);
        }
    }

    clearQueues() {
        this.spawnQueues = {};
    }

    queueSpawn(spawnRoomName, role, idealLevel) {
        if (!this.spawnQueues[spawnRoomName]) {
            this.spawnQueues[spawnRoomName] = [];
        }
        this.spawnQueues[spawnRoomName].push({ role: role, idealLevel: idealLevel });
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
        let body = [MOVE, WORK, CARRY];
        let lvl = 0;
        for (let i = 0; i < carryParts; i++) {
            lvl = i + 1;
            body.push(MOVE, CARRY, CARRY);
            if (creepSpawnUtility.getCost(body) > maxCost || lvl > CONSTANTS.maxRemoteHaulerLevel) {
                body.pop();
                body.pop();
                body.pop();
                break;
            }
        }
        return { body: body, 
                 name: "Remote Hauler " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.remoteHauler }};
    }

    getUpkeepEstimates(homeRoomInfo, remoteInfo, neededCarry) {

        function calculateUpkeep(creeps, calculation) {
            return creeps.reduce((total, curr) => total + calculation(curr.body), 0) / CREEP_LIFE_TIME;
        }

        // Let's get some basic upkeep costs for creeps in this remote
        const upkeeps = { energy: 0, spawnTime: 0 };
        const maxCost = homeRoomInfo.room.energyCapacityAvailable;

        // Start with miners
        const miners = remoteInfo.sources.map(
            (source) => this.makeMiner(maxCost));
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