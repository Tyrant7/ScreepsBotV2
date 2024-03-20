module.exports = {
    /**
     * Determines the level of each creep in the array according to the function passed.
     * @param {Creep[]} creeps An array of creeps to determine level for.
     * @param {function(Creep): number} levelDeterminer The function that determines the level of creeps.
     * @returns {number[]} An array of creep levels.
     */
    getLevels: function(creeps, levelDeterminer) {

        // Map each creep to a level determined by the determiner function
        return creeps.map((creep) => {
            return levelDeterminer(creep);
        });
    },

    /**
     * Finds the ideal level arrangement of creeps given some parameters.
     * @param {number} levelTotal The total number of levels wanted.
     * @param {number} maxLevel The max level of any individual creep.
     * @param {number} levelCost The energy cost of spawning a single level.
     * @param {number} energyCapacity The energy capacity of the room that spawning will occur in.
     * @returns {number[]} An array of creep levels.
     */
    getIdealLevels: function(levelTotal, maxLevel, levelCost, energyCapacity) {

        // Find the biggest creep we can build in this room
        const highestLevel = Math.min(energyCapacity / levelCost, maxLevel);

        // Divide our desired level count to get our desired number of creeps
        const creepCount = Math.floor(levelTotal / highestLevel);

        // If we have leftover parts that didn't fit into a max size creep, let's make a smaller one
        const leftover = levelTotal % highestLevel;

        // Add these desired levels to the queue, pushing the leftover last
        const queue = [];
        for (let i = 0; i < creepCount; i++) {
            queue.push(highestLevel);
        }
        if (leftover > 0) {
            queue.push(leftover);
        }
        return queue;
    },

    /**
     * Finds the first level of creep that has not yet been spawned, given the ideal and existing levels.
     * @param {number[]} idealLevels The ideal level arrangement of creeps.
     * @param {number[]} realLevels The actual level arrangement of creeps.
     * @returns {number} A single number, representing the level of the first missing creep to spawn.
     */
    getMissingLevel: function(idealLevels, realLevels) {

        // Let's search for the first creep that we're missing
        for (const level of idealLevels) {
            // If we already have a creep of this level, let's remove it so it doesn't get detected again
            const index = realLevels.indexOf(level);
            if (index > -1) {
                realLevels.splice(index, 1);
                continue;
            }
            // Otherwise, we're missing a creep of this level
            return level;
        }
        return null;
    },
}