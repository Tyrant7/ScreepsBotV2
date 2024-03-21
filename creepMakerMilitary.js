const creepSpawnUtility = require("creepSpawnUtility");

module.exports = {

    makeMiniDefender: function(desiredLevel, maxCost) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, RANGED_ATTACK, RANGED_ATTACK, MOVE, RANGED_ATTACK, HEAL);
            if (creepSpawnUtility.getCost(body) > maxCost) {
                for (let i = 0; i < 6; i++) {
                    body.pop();
                }
                break;
            } 
        }
        return { body: body, 
                 name: "Baby_Defender " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.defender }};
    },
}