const creepSpawnUtility = require("creepSpawnUtility");

class ScoutSpawnHandler {

    getNextSpawn(roomInfo) {

        // Don't need more than one scout per room
        if (roomInfo.scouts.length) {
            return;
        }

        // No scouts if we can't have proper remotes
        if (!roomInfo.room.storage) {
            return;
        }

        return { body: [MOVE], 
                 name: "Scout " + Game.time,
                 memory: { role: CONSTANTS.roles.scout }};
    }
}

module.exports = ScoutSpawnHandler;