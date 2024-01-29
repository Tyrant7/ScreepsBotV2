const creepSpawnUtility = require("creepSpawnUtility");
const MinerSpawnHandler = require("minerSpawnHandler");

const minerSpawnHandler = new MinerSpawnHandler();

class RemoteSpawnHandler {

    getNextSpawn(roomInfo) {
        const idealSpawns = this.getIdealSpawns(roomInfo);
        if (roomInfo.remoteBuilders.length < idealSpawns.length) {
            return idealSpawns[0];
        }
    }

    getIdealSpawns(roomInfo) {
        // Let's start by requesting builders for remotes that are in construction
        const constructingRemotes = Memory.bases[roomInfo.room.name].remotes
            .filter((remote) => remote.state === CONSTANTS.remoteStates.constructing);

        const sourceCounts = constructingRemotes.map((remote) => {
            return { room: remote.room, count: Memory.rooms[curr.room].sources.length };
        });

        const spawns = [];
        sourceCounts.forEach((remote) => {
            for (let i = 0; i < remote.count; i++) {
                const builder = this.makeBuilder(CONSTANTS.maxRemoteBuilderLevel, roomInfo.room.energyCapacityAvailable);
                builder.memory.targetRoom = remote.room;
                spawns.push(builder);
            }
        });

        console.log("requesting: " + sourceCounts.reduce((total, curr) => total + curr.count, 0) + " workers!");
        return spawns;
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

    makeMiner(sourceInfo, maxCost) {
        sourceInfo.energyCapacity = SOURCE_ENERGY_CAPACITY;
        const miner = minerSpawnHandler.make(sourceInfo, maxCost);
        return miner;
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

    getUpkeepCosts(homeRoomInfo, remoteInfo, pathInfo) {

        function calculateUpkeep(creeps, calculation) {
            return creeps.reduce((total, curr) => total + calculation(curr.body), 0) / CREEP_LIFE_TIME;
        }

        // Let's get some basic upkeep costs for creeps in this remote
        const upkeeps = { energy: 0, spawnTime: 0 };
        const maxCost = homeRoomInfo.room.energyCapacityAvailable;

        // Start with miners
        const miners = remoteInfo.sources.map(
            (source) => this.makeMiner(source, maxCost));
        upkeeps.energy += calculateUpkeep(miners, creepSpawnUtility.getCost);
        upkeeps.spawnTime += calculateUpkeep(miners, creepSpawnUtility.getSpawnTime);

        // Haulers next
        const haulers = [];
        pathInfo.sourcePaths.forEach((path) => {
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
        // Claimers will be made up of 2 CLAIM 2 MOVE bodies
        // It's technically possible with 1 CLAIM 1 MOVE, but give it extra to account for 
        // imperfections in pathing and spawning priorities
        const claimerBody = [CLAIM, CLAIM, MOVE, MOVE];
        upkeeps.energy += creepSpawnUtility.getCost(claimerBody) / CREEP_CLAIM_LIFE_TIME;
        upkeeps.spawnTime += creepSpawnUtility.getSpawnTime(claimerBody) / CREEP_CLAIM_LIFE_TIME;

        return upkeeps;
    }

    getTotalAvgSpawnTime(roomInfo) {

    }
}

module.exports = RemoteSpawnHandler;