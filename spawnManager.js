CreepMaker = require("creepMaker");

class SpawnManager {

    constructor() {
        this.creepMaker = new CreepMaker();
        this.spawnQueue = [];
    }

    run(roomInfo) {

        // Figure out which creeps will need to be replaced soon in this room
        this.handleReplacements(roomInfo);

        // Figure out what additional creeps this room needs
        this.handleMiners(roomInfo);
        this.handleHaulers(roomInfo);
        this.handleWorkers(roomInfo);

        // Spawn the next one in the queue
        this.spawnNext();
    }

    handleReplacements(roomInfo) {

        const income = roomInfo.getIncome();
        let totalQueueCost = this.spawnQueue.reduce((total, curr) => total + (curr.cost / CREEP_LIFE_TIME), 0);

        // For all creeps that will die before they can be spawned again, add them to the spawn queue
        for (const creep in roomInfo.creeps) {

            // Only do this when these two values are EQUAL to prevent replacing the same creep multiple times
            if (creep.ticksToLive === this.creepMaker.getSpawnTime(creep.body)) {

                // Also watch out that this doesn't put us over our income threshold
                const replacement = this.creepMaker.makeClone(creep);
                if (totalQueueCost + replacement.cost <= income) {
                    this.spawnQueue.push();
                    totalQueueCost += this.creepMaker.getCost(replacement.body);
                }
            }
        }
    }

    handleMiners(roomInfo) {

        // Get unreserved sources
        const sources = roomInfo.getUnreservedSources();

        // Calculate an average energy produced for each source in this room
        const sourceEnergies = sources.map((source) => source.energyCapacity / ENERGY_REGEN_TIME);
        
        // Figure out how many WORK parts it will take to harvest each source
        const workCounts = sourceEnergies.map((amount) => (amount / HARVEST_POWER) + 1);

        // Create a miner for each work counts
        const miners = workCounts.map((workParts) => this.creepMaker.makeMiner(workParts));

        // Push all miners onto the spawn queue
        miners.forEach((miner) => this.spawnQueue.push(miner));
    }

    handleHaulers(roomInfo) {
        // TODO //
    }

    handleWorkers(roomInfo) {

        // Get the total energy income for this tick
        const totalEPerTick = roomInfo.getIncome();

        // Add workers of the appropriate level to the queue while their cost 
        // averaged out over lifetime does not exceed our income
        let spawnCosts = this.spawnQueue.reduce((total, curr) => total + (curr.cost / CREEP_LIFE_TIME), 0);
        while (spawnCosts < totalEPerTick) {
            const newWorker = this.creepMaker.makeWorker(CONSTANTS.maxWorkerLevel);
            spawnCosts += newWorker.cost / CREEP_LIFE_TIME;
            if (spawnCosts < totalEPerTick) {
                this.spawnQueue.push(newWorker);
            }
        }
    }

    spawnNext(roomInfo) {
        if (this.spawnQueue.length === 0) {
            return;
        }

        // Spawn next from queue for each non-busy spawn in the room
        for (const spawn in roomInfo.spawns) {
            const next = this.spawnQueue[0];
            if (spawn.spawning) {

                // Show some visuals
                // TODO //

                continue;
            }
            spawn.spawnCreep(next.body, next.name, { 
                memory: { role: next.role }
            });
            this.spawnQueue.shift();
        }
    }
}

module.exports = SpawnManager;