module.exports = {
    getCost: function(body) {
        return _.sum(body.map((part) => BODYPART_COST[part]));
    },

    getSpawnTime: function(body) {
        return body.length * CREEP_SPAWN_TIME;
    },

    getPredictiveCreeps: function(creeps) {
        return creeps.filter((c) => {
            return !c.ticksToLive || this.getSpawnTime(c.body) <= c.ticksToLive;
        });
    },
};