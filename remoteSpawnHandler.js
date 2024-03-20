const remoteUtility = require("remoteUtility");
const creepSpawnUtility = require("creepSpawnUtility");

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
            // Rather inelegant, but it'll do
            // Haulers are measured in CARRY part count instead of creep count
            if (creep.memory.role === CONSTANTS.roles.hauler) {
                existingSpawns[creep.memory.role] += creep.body.filter((p) => p.type === CARRY).length;
                continue;
            }

            if (creep.memory.isRemote) {
                existingSpawns[creep.memory.role]++;
            }
        }
        
        // Iterate through each until we find one under its spawn requirements
        for (const remoteRoom in remotes) {
            const remote = remotes[remoteRoom];
            if (!remote.active) {
                continue;
            }

            const sourceCount = remote.haulerPaths.length;
            const spawn = this.getBestSpawn(roomInfo.room.energyCapacityAvailable, sourceCount, remote.neededHaulerCarry, existingSpawns);
            if (spawn) {
                // Tag this creep so we know it came from remote spawning and can count it against 
                // our spawns here next time we attempt spawning
                spawn.memory.isRemote = true;
                return spawn;
            }
        }

        // Any amount of hauler parts that weren't enough to make a max level by the end of all spawns
        // should overflow here
        // We know that our remaining needed carry will be equal to -existing carry value since it was subtracted
        // at the end of each spawn
        const wantedCarry = -existingSpawns[CONSTANTS.roles.hauler];
        if (wantedCarry > 0) {
            return this.makeHauler(wantedCarry, roomInfo.room.energyCapacityAvailable);
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
        // Only allow max size haulers, overflow extra wanted parts down to the next round of spawning
        // If we don't have enough to make a max size hauler
        const wantedCarryParts = neededCarry - existingSpawns[CONSTANTS.roles.hauler];
        if (wantedCarryParts > CONSTANTS.maxHaulerLevel * 2) {
            return this.makeHauler(wantedCarryParts, maxCost);
        }
        existingSpawns[CONSTANTS.roles.hauler] -= neededCarry;

        // Reservers -> just one per remote
        const wantedReservers = 1 - existingSpawns[CONSTANTS.roles.reserver];
        if (wantedReservers > 0) {
            return this.makeClaimer();
        }
        existingSpawns[CONSTANTS.roles.reserver] -= 1;
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
        const claimerBody = this.makeClaimer().body;
        upkeeps.energy += creepSpawnUtility.getCost(claimerBody) / CREEP_CLAIM_LIFE_TIME;
        upkeeps.spawnTime += creepSpawnUtility.getSpawnTime(claimerBody) / CREEP_CLAIM_LIFE_TIME;

        return upkeeps;
    }

    getTotalAvgSpawnTime(roomInfo) {

    }
}

module.exports = RemoteSpawnHandler;