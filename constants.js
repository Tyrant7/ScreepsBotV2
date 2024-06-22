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

const storageThresholds = {
    4: 5000,
    5: 10000,
    6: 15000,
    7: 20000,
    8: 25000,
};

const directionDelta = {
    [TOP]: { x: 0, y: -1 },
    [TOP_RIGHT]: { x: 1, y: -1 },
    [RIGHT]: { x: 1, y: 0 },
    [BOTTOM_RIGHT]: { x: 1, y: 1 },
    [BOTTOM]: { x: 0, y: 1 },
    [BOTTOM_LEFT]: { x: -1, y: 1 },
    [LEFT]: { x: -1, y: 0 },
    [TOP_LEFT]: { x: -1, y: -1 },
};

const ROAD_PATHING_COST = 1;
const CONTAINER_PATHING_COST = 6;

module.exports = {
    roles,
    pathSets,
    maxLevels,
    ROAD_PATHING_COST,
    CONTAINER_PATHING_COST,
    storageThresholds,
    directionDelta,
};
