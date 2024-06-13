// Figure out how many WORK parts it will take to fully harvest a source before it regens
const MINER_WORK =
    SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME / HARVEST_POWER + 1;

// Static reserver cost to determine how much energy capacity we can start reserving at
const RESERVER_COST = creepSpawnUtility.getCost(creepMaker.makeReserver().body);

module.exports = {
    MINER_WORK,
    RESERVER_COST,
};
