const getCost = (body) => _.sum(body.map((part) => BODYPART_COST[part]));
const getSpawnTime = (body) => body.length * CREEP_SPAWN_TIME;
const getPredictiveCreeps = (creeps) =>
    creeps.filter(
        (c) => !c.ticksToLive || getSpawnTime(c.body) <= c.ticksToLive
    );

module.exports = {
    getCost,
    getSpawnTime,
    getPredictiveCreeps
};
