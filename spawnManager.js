const CreepMaker = require("creepMaker");

const minerSpawnThreshold = 450;
const haulerSpawnThreshold = 450;

const workerHardCap = 9;

class SpawnManager {

    constructor() {
        this.creepMaker = new CreepMaker();
        this.spawnQueue = [];
    }

    run(roomInfo) {

        // Don't try to spawn in rooms that aren't ours
        if (!roomInfo.spawns || roomInfo.spawns.length === 0) {
            return;
        }

        // Figure out which creeps will need to be replaced soon in this room
        this.handleReplacements(roomInfo);

        // Figure out what additional creeps this room needs
        if (roomInfo.room.energyAvailable > minerSpawnThreshold) {
            this.handleMiners(roomInfo);
        }
        if (roomInfo.room.energyAvailable > haulerSpawnThreshold) {
            this.handleHaulers(roomInfo);
        }
        this.handleWorkers(roomInfo);

        // Spawn the next one in the queue
        this.spawnNext(roomInfo);

        console.log("Spawn queue length: " + this.spawnQueue.length);
        for (const spawn of this.spawnQueue) {
            console.log(spawn.name);
        }
    }

    handleReplacements(roomInfo) {

        const income = roomInfo.getGrossIncome();
        let totalQueueCost = this.spawnQueue.reduce((total, curr) => total + (curr.cost / CREEP_LIFE_TIME), 0);

        // For all creeps that will die before they can be spawned again, add them to the spawn queue
        for (const creep of roomInfo.creeps) {

            // Only do this when these two values are EQUAL to prevent replacing the same creep multiple times
            if (creep.ticksToLive === this.creepMaker.getSpawnTime(creep.body)) {

                // Too expensive to replace in this room
                if (this.creepMaker.getCost(creep.body) > roomInfo.room.energyCapacityAvailable) {
                    continue;
                }

                // Also watch out that this doesn't put us over our income threshold
                const replacement = this.creepMaker.makeClone(creep);
                if (totalQueueCost + replacement.cost <= income) {
                    this.spawnQueue.push(replacement);
                    totalQueueCost += this.creepMaker.getCost(replacement.body);
                }
            }
        }
    }

    handleMiners(roomInfo) {

        // Get unreserved sources
        const sources = roomInfo.getUnreservedSources();

        // Don't allow more miners than sources
        if (this.filterQueue(CONSTANTS.roles.miner).length >= sources.length) {
            return;
        }

        // Calculate an average energy produced for each source in this room
        const sourceEnergies = sources.map((source) => source.energyCapacity / ENERGY_REGEN_TIME);
        
        // Figure out how many WORK parts it will take to harvest each source
        const workCounts = sourceEnergies.map((amount) => (amount / HARVEST_POWER) + 1);

        // Create a miner for each work counts
        const miners = workCounts.map((workParts) => this.creepMaker.makeMiner(workParts, roomInfo.room.energyCapacityAvailable));
        for (const i in miners) {
            miners[i].memory.sourceID = sources[i].id;
        }

        // Push all miners onto the spawn queue
        miners.forEach((miner) => this.spawnQueue.push(miner));
    }

    handleHaulers(roomInfo) {
        // TODO //
    }

    handleWorkers(roomInfo) {

        // TEMPORARY FIX //
        // Don't allow us to exceed our hard cap
        const queuedWorkers = this.filterQueue(CONSTANTS.roles.worker);
        if (roomInfo.workers.length + queuedWorkers.length >= workerHardCap) {
            return;
        }

        // Workers are allocated based on number of WORK parts using the formula
        // Before we have miners, allocate workers using nSourceSpots + 1, otherwise use the formula
        // X WORK parts per Y gross income
        // Ratio determined through trial and error to be an acceptable value
        const incomeToPartRatio = 1.1;
        const maxWorkParts = roomInfo.miners.length ? Math.ceil(roomInfo.getGrossIncome() * incomeToPartRatio) : roomInfo.openSourceSpots + 1;

        // Sum up part counts for workers, both existing and in the queue
        const currentWorkParts = roomInfo.workers.reduce((total, curr) => total + curr.body.filter((p) => p.type === WORK).length, 0)
                                + queuedWorkers.reduce((total, curr) => total + curr.body.filter((p) => p.type === WORK).length, 0);

        // Limited to one worker added to the queue per tick to avoid duplicate naming     
        // Also limit ourselves to spawning lower level workers first if we get wiped out
        const maxLevel = Math.min(roomInfo.workers.length + queuedWorkers.length + 1, CONSTANTS.maxWorkerLevel);

        // Adjust level so that we spawn lower level workers if we're near our WORK part max
        const adjustedLevel = Math.min(maxLevel, maxWorkParts - currentWorkParts);
        if (adjustedLevel > 0) {
            const newWorker = this.creepMaker.makeWorker(adjustedLevel, roomInfo.room.energyCapacityAvailable);
            this.spawnQueue.push(newWorker);
        }
    }

    spawnNext(roomInfo) {
        if (this.spawnQueue.length === 0) {
            return;
        }

        // Spawn next from queue for each non-busy spawn in the room
        for (const spawn of roomInfo.spawns) {
            const next = this.spawnQueue[0];
            if (spawn.spawning) {
                // Show some visuals
                try {
                    const spawningCreep = Game.creeps[spawn.spawning.name]
                    roomInfo.room.visual.text(
                        // Show role + level
                        spawningCreep.memory.role + " " + next.name.split(" ")[1],
                        spawn.pos.x,
                        spawn.pos.y - 1,
                        { align: "center", opacity: 0.8 });
                }
                catch (e) {
                    console.log("Error when showing spawn visual: " + e);
                }

                continue;
            }
            // Save the room responsible for this creep
            next.memory.home = roomInfo.room.name;
            const result = spawn.spawnCreep(next.body, next.name, { 
                memory: next.memory
            });
            if (result === OK) {
                this.spawnQueue.shift();
            }
        }
    }

    filterQueue(role) {
        return this.spawnQueue.filter((spawn) => spawn.memory.role === role);
    }
}

module.exports = SpawnManager;