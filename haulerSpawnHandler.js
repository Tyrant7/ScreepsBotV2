const creepSpawnUtility = require("creepSpawnUtility");
const LeveledSpawnHandler = require("leveledSpawnHandler");

class HaulerSpawnHandler extends LeveledSpawnHandler {

    /**
     * Figures out the ideal spawn levels for haulers in this room.
     * @param {RoomInfo} roomInfo The info object associated with the room.
     * @returns {number[]} An array of levels for ideal haulers in this room. Each elements corresponds to a creep.
     */
    getIdealSpawns(roomInfo) {

        // Figure out how many CARRY parts we ideally want
        const incomeToPartRatio = 0.8;
        const maxCarryParts = Math.ceil(roomInfo.getMaxIncome() * incomeToPartRatio);

        // Find the most expensive hauler we can build in this room
        const levelCost = creepSpawnUtility.getCost([MOVE, CARRY, CARRY]);
        const haulerLevel = Math.min(roomInfo.room.energyCapacityAvailable / levelCost, CONSTANTS.maxHaulerLevel);

        // Let's adjust the number of haulers we want depending on our upgraders
        const upgraderWorkParts = roomInfo.upgraders.reduce((total, upgrader) => {
            return total + upgrader.body.filter((p) => p.type === WORK);
        }, 0);

        // If we have more upgrade parts, let's take more haulers since the energy will be used up quicker
        const upgradeToCarryRatio = 4;
        const wantedCarryParts = maxCarryParts + (upgraderWorkParts / upgradeToCarryRatio);

        // Divide our desired part count to get our desired number of haulers
        const haulerCount = Math.floor(wantedCarryParts / haulerLevel);

        // If we have leftover parts that didn't fit into a max size hauler, let's make a smaller one
        const leftover = wantedCarryParts % haulerLevel;

        // Add these desired haulers to the queue, pushing the leftover first
        const queue = [];
        if (leftover > 0) {
            queue.push(leftover);
        }
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

        // Reduces all existing haulers to an array containing only their level, 
        // excluding ones that will die before they can be replaced
        const predictiveHaulers = creepSpawnUtility.getPredictiveCreeps(roomInfo.haulers);
        return predictiveHaulers.map((h) => h.body.filter((p) => p.type === MOVE).length);
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
                break;
            } 
        }
        return { body: body, 
                 name: "Hauler " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.hauler }};
    }
}

module.exports = HaulerSpawnHandler;