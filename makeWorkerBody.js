const creepSpawnUtility = require("creepSpawnUtility");

module.exports = function make(desiredLevel, energy) {
    const workerParts = [WORK, CARRY, MOVE];
    let body = workerParts;
    let lvl = 1;
    const levelCost = creepSpawnUtility.getCost(body);
    while (lvl < desiredLevel && (lvl + 1) * levelCost <= energy) {
        lvl++;
        body = body.concat(workerParts);
    }
    return body;
}
