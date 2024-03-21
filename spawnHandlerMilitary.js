const creepMaker = require("creepMakerMilitary");

class MilitarySpawnHandler {

    getNextSpawn(roomInfo) {
        return this.trySpawnDefender(roomInfo);
    }

    trySpawnDefender(roomInfo) {  
        const enemies = roomInfo.getEnemies();
        if (enemies.length > roomInfo.defenders.length) {

            // Find our strongest enemy
            const mostFightParts = enemies.reduce((strongest, curr) => {
                const fightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL).length;
                return fightParts > strongest ? fightParts : strongest;
            }, 0);

            // Make an appropriately sized defender
            // i.e. one level larger in size
            return creepMaker.makeMiniDefender(Math.ceil(mostFightParts / 4) + 1, roomInfo.room.energyCapacityAvailable);
        }
    }
}

module.exports = MilitarySpawnHandler;