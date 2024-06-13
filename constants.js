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
    smallBuilder: 4,
    mineralMiner: 8,
};

const maxCounts = {
    builder: 5,
    scouts: 1,
    upgraders: 8,
};

const controllerDowngradeDangerLevel = 5000;

module.exports = {
    roles,
    pathSets,
    maxLevels,
    maxCounts,
    controllerDowngradeDangerLevel,
};
