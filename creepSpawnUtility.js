function getCost(body) {
    return _.sum(body.map((part) => BODYPART_COST[part]));
}

function getSpawnTime(body) {
    return body.length * CREEP_SPAWN_TIME;
}

module.exports = { getCost: getCost, getSpawnTime: getSpawnTime };