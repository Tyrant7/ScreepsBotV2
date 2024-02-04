const creepSpawnUtility = require("creepSpawnUtility");
const MinerSpawnHandler = require("minerSpawnHandler");

const minerSpawnHandler = new MinerSpawnHandler();

class RemoteSpawnHandler {

    getNextSpawn(roomInfo) {

        const base = Memory.bases[roomInfo.room.name];
        if (!base) {
            return;
        }
        
        for (const role in base.remoteSpawns) {
            const demand = Math.max(base.remoteSpawns[role].ideal - base.remoteSpawns[role].current, 0);
            if (demand > 0) {
                if (role === "builders") {
                    return this.makeBuilder(CONSTANTS.maxRemoteBuilderLevel, roomInfo.room.energyCapacityAvailable);
                }
                else if (role === "reservers") {
                    return this.makeReserver();
                }
                else if (role === "miners") {
                    return this.makeMiner(roomInfo.room.energyCapacityAvailable);
                }
                else if (role === "haulers") {
                    return this.makeHauler(CONSTANTS.maxRemoteHaulerLevel, roomInfo.room.energyCapacityAvailable);
                }
            }
        }
    }

    makeBuilder(desiredLevel, maxCost) {
        const builderParts = [WORK, CARRY, MOVE];
        let body = builderParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < desiredLevel && (lvl + 1) * levelCost <= maxCost) {
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
        return minerSpawnHandler.make(maxCost);
    }

    makeHauler(carryParts, maxCost) {
        let body = [MOVE, WORK, CARRY];
        let lvl = 0;
        for (let i = 0; i < carryParts; i++) {
            lvl = i + 1;
            body.push(MOVE, CARRY, CARRY);
            if (creepSpawnUtility.getCost(body) > maxCost) {
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

    getUpkeepEstimates(homeRoomInfo, remoteInfo, haulerPaths) {

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
        haulerPaths.forEach((path) => {
            // Each source gives 10 energy per tick, and hauler is empty on the way back
            // Therefore, 20 * distance / CARRY_CAPACITY
            let neededCarry = Math.ceil(20 * path.length / CARRY_CAPACITY);

            // Keep making haulers until we have enough to transport all energy we'll mine
            while (neededCarry > 0) {
                const hauler = this.makeHauler(neededCarry, maxCost);
                neededCarry -= hauler.body.filter((p) => p === CARRY);
                haulers.push(hauler);
            }
        });
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