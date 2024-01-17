const creepSpawnUtility = require("creepSpawnUtility");

// Base class for WorkerSpawnInfo and HaulerSpawnInfo objects
// Allows for combining or lower level creeps into higher level ones as capability for larger creeps increases
class LeveledSpawnInfo {

    getIdealSpawns(roomInfo) {
        throw new Error("You must implement getIdealSpawns()");
    }

    getRealMembers(roomInfo) {
        throw new Error("You must implement getRealMembers()");
    }

    make(desiredLevel, energy) {
        throw new Error("You must implement make()");
    }

    getNextSpawn(roomInfo) {

        // Find our ideal and actual levels for this type of creep
        const idealLevels = this.getIdealSpawns(roomInfo);
        const realLevels = this.getRealMembers(roomInfo);

        // Let's create a new array that contains what we're missing from real levels to reach ideal
        const missingLevels = [];
        for (const level of idealLevels) {
            // If real levels contains this ideal one, let's remove it
            const index = realLevels.indexOf(level);
            if (index >= 0) {
                realLevels.splice(index, 1);
            }
            // Otherwise, we're missing it
            else {
                missingLevels.push(level);
            }
        }

        if (realLevels.length) {

            // Let's sum up all levels still left in real levels
            let extraLevels = realLevels.reduce((total, curr) => total + curr, 0);
            
            // Now missingLevels should contain all of the creeps of levels we have yet to spawn
            // Let's subtract our existing extra levels to balance the scale
            for (let level of missingLevels) {
                const oldLevel = level;
                level -= extraLevels;
                extraLevels -= oldLevel;
                if (extraLevels <= 0) {
                    break;
                }
            }
        }

        // Now we have a list of all levels that we're below by in the largest increment this room can handle spawning
        // Let's simply return an appropriate creep for the first one that is still valid
        for (const level of missingLevels) {
            if (level > 0) {
                return this.make(level, roomInfo.room.energyCapacityAvailable);
            }
        }

        // No valid levels remaining
        return;
    }
}

module.exports = LeveledSpawnInfo;