const getCost = (body) => _.sum(body.map((part) => BODYPART_COST[part]));
const getSpawnTime = (body) => body.length * CREEP_SPAWN_TIME;
const getPredictiveCreeps = (creeps) =>
    creeps.filter(
        (c) => !c.ticksToLive || getSpawnTime(c.body) <= c.ticksToLive
    );

const filterSupportingForRole = (colony, role) =>
    colony.memory.supporting
        ? colony.memory.supporting.reduce(
              (total, curr) =>
                  total +
                  Memory.newColonies[curr].spawns.filter((s) => s === role)
                      .length,
              0
          )
        : 0;

module.exports = {
    getCost,
    getSpawnTime,
    getPredictiveCreeps,
    filterSupportingForRole,
};
