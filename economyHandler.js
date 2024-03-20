const ProductionSpawnHandler = require("spawnHandlerProduction");
const UsageSpawnHandler = require("spawnHandlerUsage");
const MilitarySpawnHandler = require("spawnHandlerMilitary");

const productionSpawnHandler = new ProductionSpawnHandler();
const usageSpawnHandler = new UsageSpawnHandler();
const militarySpawnHandler = new MilitarySpawnHandler();

const remoteUtility = require("remoteUtility");

class EconomyHandler {

    run(roomInfo) {

        // Override default behaviour with defense if we're under attack
        if (roomInfo.getEnemies().length) {
            const militarySpawn = militarySpawnHandler.getNextSpawn(roomInfo);
            if (militarySpawn) {
                return militarySpawn;
            }
        }

        //
        // If our defense is under control
        // let's figure out how many remotes we can sustain with our current spawn capacity
        // while ensuring that we're using enough of the energy provided to meet our saving goal
        //

        const savingGoal = this.determineSavingGoal(roomInfo);
        const spendFraction = 1 - savingGoal.fraction;
        const income = this.setupIdealIncomeConfiguration(roomInfo, spendFraction);

        if (roomInfo.storage && roomInfo.storage.store[RESOURCE_ENERGY] >= savingGoal.goal) {
            // We did it! Start a different type of spawn cycle
        }
        else {
            this.handleDefaultSpawnOrder(roomInfo, income * spendFraction);
        }
    }

    determineSavingGoal(roomInfo) {

        // TODO //
        return {
            goal: 50000,
            fraction: 0.2,
        };
    }

    /**
     * Maximizing our income by activing or dropping remotes while ensuring that we spend enough to meet our saving goal.
     * @param {RoomInfo} roomInfo The info object to do this for.
     * @param {number} spendFraction The fraction of income to allow spending for.
     * @returns {number} The total income of this base.
     */
    setupIdealIncomeConfiguration(roomInfo, spendFraction) {

        // To start, we already know the income and upkeep estimates of this room
        const roomUpkeep = productionSpawnHandler.estimateUpkeepForBase(roomInfo);
        const roomIncome = roomInfo.getMaxIncome() - roomUpkeep.energy;

        // These will be tracked separately, since we may use the energy differently depending on how much we have
        // usageSpawnCost will not compound easily and will be based on income
        let productionSpawnCost = roomUpkeep.spawnTime;
        let usageSpawnCost = usageSpawnHandler.estimateSpawnTimeForUsage(roomInfo, roomIncome * spendFraction);

        let totalIncome = roomIncome;

        // Process each planned remote, cutting off when the spawns go above our threshold
        let passedThreshold = false;
        for (const remoteRoom in remotePlans) {
            const remote = remotePlans[remoteRoom];

            // For this remote, we can estimate how much spawn time it will take us to use the energy produced here
            totalIncome += remote.score;
            usageSpawnCost = usageSpawnHandler.estimateSpawnTimeForUsage(roomInfo, totalIncome * spendFraction);

            // That gives us the total amount of spawn time it will take to produce and use the energy of this remote
            productionSpawnCost += remote.cost;

            // Once we hit our cutoff, mark all remaining remotes as inactive
            if (passedThreshold || productionSpawnCost + usageSpawnCost >= 1) {
                passedThreshold = true;
                remote.active = false;
                continue;
            }

            // Mark this remote as active and process it
            remote.active = true;
        }
        return totalIncome;
    }

    handleDefaultSpawnOrder(roomInfo, energyToUse) {



        // TODO //
        // Figure out what to spawn, producer or user

        // Let's estimate our actual production vs usage values
        // If we're producing more than we're using (minus our saving amount, of course)
        // Then we'll spawn a user next
        // Otherwise, we'll spawn a producer
    }
}

module.exports = EconomyHandler;