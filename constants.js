module.exports = {
    roles: {
        worker: "worker",
        miner: "miner",
        hauler: "hauler",
        upgrader: "upgrader",
        repairer: "repairer",
        scout: "scout",
        reserver: "reserver",
        defender: "defender",
    },
    maxWorkerLevel: 8,
    maxHaulerLevel: 12,
    maxUpgraderLevel: 6,
    maxRepairerLevel: 8,
    maxBaseSpawnCapacity: 0.95,
    minEnergyStored: 5000,

    // Intervals for expensive code
    repairerInterval: 5,
};