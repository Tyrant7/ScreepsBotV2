class ColonyConstructionManager {
    
    run(roomInfo) {


    }

    placeUpgraderContainer(roomInfo) {

        // Upgrader
        Memory.bases[roomInfo.room.name].upgraderContainer = bestPos;

        // Miner
        if (!Memory.bases[source.pos.roomName].minerContainers) {
            Memory.bases[source.pos.roomName].minerContainers = {};
        }
        Memory.bases[source.pos.roomName].minerContainers[source.id] = containerPos;

        // Mineral
        if (!Memory.bases[mineral.pos.roomName].mineralContainers) {
            Memory.bases[mineral.pos.roomName].mineralContainers = {};
        }
        Memory.bases[mineral.pos.roomName].mineralContainers[mineral.id] = containerPos;
    }
}

module.exports = ColonyConstructionManager;