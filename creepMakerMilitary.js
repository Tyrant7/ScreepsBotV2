module.exports = {

    makeMiniDefender: function(desiredLevel, maxCost) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL);
            if (creepSpawnUtility.getCost(body) > maxCost) {
                body.pop();
                body.pop();
                body.pop();
                break;
            } 
        }
        return { body: body, 
                 name: "Baby Defender " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.defender }};
    },
}