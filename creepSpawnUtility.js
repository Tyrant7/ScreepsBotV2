module.exports = {
    getCost: function(body) {
        return _.sum(body.map((part) => BODYPART_COST[part]));
    },

    getSpawnTime: function(body) {
        return body.length * CREEP_SPAWN_TIME;
    },
};