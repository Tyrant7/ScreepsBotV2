const creepSpawnUtility = require("creepSpawnUtility");

class DefenderSpawnHandler {

    getNextSpawn(roomInfo) {
        
        const enemies = roomInfo.getEnemies();
        if (enemies.length > roomInfo.defenders.length) {

            // Find our strongest enemy
            const mostFightParts = enemies.reduce((strongest, curr) => {
                if (!curr.body) {
                    return strongest;
                }
                const fightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL);
                return fightParts > strongest ? fightParts : strongest;
            }, 0);

            // Make an appropriately sized defender
            return this.makeMiniDefender(Math.ceil(mostFightParts / 4), roomInfo.room.energyCapacityAvailable);
        } 
    }

    makeMiniDefender(idealLevel, maxCost) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < idealLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, ATTACK, ATTACK, ATTACK, HEAL);
            if (creepSpawnUtility.getCost(body) > maxCost) {
                body.pop();
                body.pop();
                body.pop();
                break;
            } 
        }
        return { body: body, 
                 name: "Ranged Defender " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.defender }};
    }
}

module.exports = DefenderSpawnHandler;