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
        return this.make();
    }

    make() {
        return { body: [MOVE], 
            name: "Scout " + Game.time + " [1]",
            memory: { role: CONSTANTS.roles.scout }};
    }

    getTotalAvgSpawnTime(roomInfo) {
        return creepSpawnUtility.getSpawnTime(this.make().body) / CREEP_LIFE_TIME;
    }
}

module.exports = ScoutSpawnHandler;