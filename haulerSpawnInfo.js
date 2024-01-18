const creepSpawnUtility = require("creepSpawnUtility");
const LeveledSpawnInfo = require("leveledSpawnInfo");

class HaulerSpawnInfo extends LeveledSpawnInfo {

    /**
     * Figures out the ideal spawn levels for haulers in this room.
     * @param {RoomInfo} roomInfo The info object associated with the room.
     * @returns {number[]} An array of levels for ideal haulers in this room. Each elements corresponds to a creep.
     */
    getIdealSpawns(roomInfo) {

        // Figure out how many CARRY parts we ideally want
        const incomeToPartRatio = 0.95;
        const maxCarryParts = Math.ceil(roomInfo.getMaxIncome() * incomeToPartRatio);

        // Find the most expensive hauler we can build in this room
        const levelCost = creepSpawnUtility.getCost([MOVE, CARRY, CARRY]);
        const haulerLevel = Math.min(roomInfo.room.energyCapacityAvailable / levelCost, CONSTANTS.maxHaulerLevel);

        // Divide our desired part count to get our desired number of haulers
        const haulerCount = Math.floor(maxCarryParts / haulerLevel);

        // If we have leftover parts that didn't fit into a max size hauler, let's make a smaller one
        const leftover = maxCarryParts % haulerLevel;

        // Add these desired haulers to the queue, pushing the leftover first
        const queue = [];
        queue.push(leftover);
        for (let i = 0; i < haulerCount; i++) {
            queue.push(haulerLevel);
        }
        return queue;
    }

    /**
     * Figures out the levels of all haulers in this room.
     * @param {RoomInfo} roomInfo The info object associated with the room.
     * @returns {number[]} An array of levels for current haulers in this room. Each elements corresponds to a creep.
     */
    getRealMembers(roomInfo) {

        // Reduces all existing haulers to an array containing only their level
        return roomInfo.haulers.map((h) => h.body.filter((p) => p.type === MOVE).length);
    }

    /**
     * Creates some meta data for spawning a hauler of the desired level.
     * @param {number} desiredLevel The level of hauler to create.
     * @param {number} energy The max energy cost of the created hauler.
     * @returns {{}} An object with meta data.
     */
    make(desiredLevel, energy) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, CARRY, CARRY);
            if (creepSpawnUtility.getCost(body) > energy) {
                body.pop();
                body.pop();
                body.pop();
                return;
            } 
        }
        return { body: body, 
                 name: "Hauler " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.hauler }};
    }
}

module.exports = HaulerSpawnInfo;