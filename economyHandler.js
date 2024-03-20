const ProductionSpawnHandler = require("spawnHandlerProduction");
const UsageSpawnHandler = require("usageSpawnHandler");

const productionSpawnHandler = new ProductionSpawnHandler();
const usageSpawnHandler = new UsageSpawnHandler();

const remoteUtility = require("remoteUtility");

class EconomyHandler {

    run(roomInfo) {

        const maxSpawnCost = 1;
        //
        // Let's figure out how many remotes we can sustain with our current spawn capacity
        // while ensuring that we're using enough of the energy provided to meet our saving goal
        //

        // Let's figure out what we're working towards
        const savingGoal = this.determineSavingGoal(roomInfo);

        if (roomInfo.storage && roomInfo.storage.store[RESOURCE_ENERGY] >= savingGoal.goal) {
            // We did it! Start a different type of spawn cycle
        }
        else {
            this.spawnTowardGoal(roomInfo, savingGoal);
        }
    }

    determineSavingGoal(roomInfo) {

        // TODO //
        return {
            goal: 50000,
            fraction: 0.2,
        };
    }

    spawnTowardGoal(roomInfo, savingGoal) {
        const spendFraction = 1 - savingGoal.fraction;

        // To start, we already know the income and upkeep estimates of this room
        const roomUpkeep = productionSpawnHandler.estimateUpkeepForBase(roomInfo);
        const roomIncome = roomInfo.getMaxIncome() - roomUpkeep.energy;
        let spawnCosts = roomUpkeep.spawnTime;
        spawnCosts += usageSpawnHandler.estimateSpawnTimeForUsage(roomInfo, roomIncome * spendFraction);

        // Process each planned remote, cutting off when the spawns go above our threshold
        let passedThreshold = false;
        for (const remoteRoom in remotePlans) {
            const remote = remotePlans[remoteRoom];

            // For this remote, we can estimate how much spawn time it will take us to use the energy produced here
            const usageSpawnTime = usageSpawnHandler.estimateSpawnTimeForUsage(roomInfo, remote.score * spendFraction);

            // That gives us the total amount of spawn time it will take to produce and use the energy of this remote
            const remoteSpawnTime = remote.cost + usageSpawnTime;

            // Once we hit our cutoff, mark all remaining remotes as inactive
            if (passedThreshold || spawnCosts + remoteSpawnTime >= maxSpawnCost) {
                passedThreshold = true;
                remote.active = false;
                continue;
            }

            // Mark this remote as active and process it
            remote.active = true;
            spawnCosts += remoteSpawnTime;
        }

        // Now we've maximized the number of active remotes which we can use energy for
        // We can simply spawn all of the creeps we need since we're under our threshold for spawn capacity

        // TODO //
        // Figure out what to spawn, producer or user
    }
}

module.exports = EconomyHandler;