const creepSpawnUtility = require("creepSpawnUtility");

// Base class for WorkerSpawnInfo and HaulerSpawnInfo objects
// Allows for combining or lower level creeps into higher level ones as capability for larger creeps increases
class LeveledSpawnHandler {

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
            // If we already have a creep of this level, let's remove it so it doesn't get detected again
            const index = realLevels.indexOf(level);
            if (index > -1) {
                realLevels.splice(index, 1);
            }
            // Otherwise, we're missing it
            else {
                missingLevels.push(level);
            }
        }

        // Let's sort missingLevels by lowest value first
        const sortedLevels = missingLevels.sort();
        if (sortedLevels.length) {
            return this.make(sortedLevels[0], roomInfo.room.energyCapacityAvailable);
        }

        // No valid levels to spawn with
        return;
    }

    /**
     * Gets the total spawn time for ideal creeps in this room, averaged out of their lifetimes.
     * @param {RoomInfo} roomInfo The info object associated with the room.
     * @returns {number} The total spawn time.
     */
    getTotalAvgSpawnTime(roomInfo) {
        return this.getIdealSpawns(roomInfo).reduce(
            (total, curr) => total + creepSpawnUtility.getSpawnTime(this.make(curr, roomInfo.room.energyCapacityAvailable).body), 0)
            / CREEP_LIFE_TIME;
    }
}

module.exports = LeveledSpawnHandler;