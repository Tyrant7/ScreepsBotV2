const roles = {
    miner: "miner",
    hauler: "hauler",
    starterHauler: "s_hauler",
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
/**
 * The cost to path through a working creep, like a miner or upgrader.
 * This value is a multiplier of the terrain cost underneath.
 */
const INTERRUPT_PATHING_COST = 3;

const REPLAN_REMOTE_INTERVAL = 500;

/**
 * Start building remote roads at this RCL.
 */
const REMOTE_ROAD_RCL = 3;
/**
 * Start building remote containers at this RCL.
 */
const REMOTE_CONTAINER_RCL = 4;

const ROOM_SIZE = 50;

module.exports = {
    roles,
    pathSets,
    maxLevels,
    ROAD_PATHING_COST,
    INTERRUPT_PATHING_COST,
    storageThresholds,
    directionDelta,
    REPLAN_REMOTE_INTERVAL,
    REMOTE_ROAD_RCL,
    REMOTE_CONTAINER_RCL,
    ROOM_SIZE,
};
