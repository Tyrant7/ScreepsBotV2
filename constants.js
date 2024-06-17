const roles = {
    miner: "miner",
    hauler: "hauler",
    upgrader: "upgrader",
    repairer: "repairer",
    builder: "builder",
    scout: "scout",
    reserver: "reserver",
    defender: "defender",
    mineralMiner: "mineral_miner",
};

const pathSets = {
    default: "default",
};

const maxLevels = {
    hauler: 16,
    upgrader: 9,
    repairer: 4,
    builder: 6,
    mineralMiner: 8,
};

const ROAD_PATHING_COST = 1;
const CONTAINER_PATHING_COST = 6;

module.exports = {
    roles,
    pathSets,
    maxLevels,
    ROAD_PATHING_COST,
    CONTAINER_PATHING_COST,
};
