module.exports = {
    roles: {
        worker: "worker",
        miner: "miner",
        hauler: "hauler",
        scout: "scout",
        remoteBuilder: "r_Builder",
        remoteHauler: "r_Hauler",
    },
    remoteStates: {
        constructing: 0,
        active: 1,
        contested: 2,
        abandoned: 3,
    },
    maxWorkerLevel: 8,
    maxHaulerLevel: 8,
    maxBaseSpawnCapacity: 0.7,
};