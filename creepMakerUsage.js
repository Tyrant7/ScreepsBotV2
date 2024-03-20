module.exports = {

    makeUpgrader: function(maxCost) {
        // Make the biggest upgrader we can for this room
        let body = [CARRY, CARRY];
        let lvl = 0;
        while (lvl < CONSTANTS.maxUpgraderLevel) {
            lvl++;
            body.push(...[MOVE, WORK, WORK, WORK, WORK]);
            if (creepSpawnUtility.getCost(body) > maxCost || body.length > 50) {
                lvl--;
                body.pop();
                body.pop();
                body.pop();
                body.pop();
                body.pop();
                break;
            }
        }
        return { body: body, 
                 name: "Upgrader " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.upgrader }};
    },

    makeBuilder: function(desiredLevel, energy) {
        const builderParts = [WORK, CARRY, MOVE];
        let body = builderParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < desiredLevel && (lvl + 1) * levelCost <= energy && body.length <= 50 - builderParts.length) {
            lvl++;
            body = body.concat(builderParts);
        }
        return { body: body,
                 name: "Builder " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.builder }};
    },


    makeRepairer: function(desiredLevel, energy) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, CARRY, CARRY, WORK);
            if (creepSpawnUtility.getCost(body) > energy) {
                body.pop();
                body.pop();
                body.pop();
                body.pop();
                break;
            } 
        }
        return { body: body, 
                 name: "Repairer " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.repairer }};
    },

    makeScout: function() {
        return { body: [MOVE], 
            name: "Scout " + Game.time + " [1]",
            memory: { role: CONSTANTS.roles.scout }};
    },

    makeMiniDefender(idealLevel, maxCost) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < idealLevel; i++) {
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
};