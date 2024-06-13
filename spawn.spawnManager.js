const {
    ensureDefaults,
    getRoleDemand,
    bumpRoleDemand,
} = require("./spawn.demandHandler");

class SpawnManager {
    run(roomInfo) {
        // Ensure demands exist
        ensureDefaults(roomInfo.room.name);

        // foreach creep in order of priority
        // "nudge" demand up or down depending on current condition of colony
        // then...
        // foreach creep in order of priority
        // if demand > current, new creep of that role
        // when a large event happens, like adding or dropping a remote
        // we will perform a "bump" for spawn demand of that role
        // and freeze nudging until for X ticks
        // where X is equal to math.abs(number of ticks to spawn 1 creep of role * bumped amount)
    }
}

module.exports = SpawnManager;
