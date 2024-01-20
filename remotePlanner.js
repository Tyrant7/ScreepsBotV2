class RemotePlanner {

    planRemote(roomInfo, targetName) {

        // Ensure that we have information on the target room
        const remoteInfo = Memory.rooms[targetName];
        if (!remoteInfo.lastVisit) {
            return;
        }

        // Make sure it's a valid remote
        if (!remoteInfo.isValidRemote(targetName)) {
            return;
        }

        // Let's calculate some necessary things for determining the efficiency of this remote:
        // 
        // - The distance of the sources to the closest tile in the dependant room
        // - The distance of the controller to the closest tile in the dependant room
        // 
        // We can use these figures to determine:
        // Necessary miner sizes and counts 
        //   - One per source, X WORK parts to fully mine source
        // Necessary hauler sizes and counts:
        //   - One per source, X CARRY parts to fully travel back to storage or link in dependant and back
        //   - Plus one additional WORK and MOVE and CARRY parts to account for small things 
        //     like being blocked by another creep and repairing roads 
        //   - May require multiple haulers per source if far away
        // Claimer size and count:
        //   - Creeps will be made up of 2 CLAIM 2 MOVE bodies to account for travel time
        // All creeps will be spawned early to account for travel time

        
    }

    isValidRemote(roomName) {
        const remoteInfo = Memory.rooms[targetName];

        // No sources
        if (!remoteInfo.sourcePositions || !remoteInfo.sourcePositions.length) {
            return false;
        }

        // Too dangerous
        if ((remoteInfo.sourceKeepers && remoteInfo.sourceKeepers.length) || 
            (remoteInfo.keeperLairs && remoteInfo.keeperLairs.length)) {
            return false;
        }

        // Stronghold
        if (remoteInfo.invaderCores && remoteInfo.invaderCores.length) {
            return false;
        }
        return true;
    }

    createRemote() {

    }
}

module.exports = RemotePlanner;