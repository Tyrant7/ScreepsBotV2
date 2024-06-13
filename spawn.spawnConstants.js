// Figure out how many WORK parts it will take to fully harvest a source before it regens
const MINER_WORK =
    SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME / HARVEST_POWER + 1;

module.exports = {
    MINER_WORK,
};
