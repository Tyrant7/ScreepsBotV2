const creepSpawnUtility = require("creepSpawnUtility");

class UpgraderSpawnHandler {

    getNextSpawn(roomInfo) {
        // Upgrader won't be able to do much without their container
        if (!roomInfo.getUpgraderContainer()) {
            return;
        }

        if (creepSpawnUtility.getPredictiveCreeps(roomInfo.upgraders).length === 0) {
            return this.make(roomInfo.room.energyCapacityAvailable);
        }
    }

    getIdealSpawns(roomInfo) {
        // Just one ideally
        return [this.make(roomInfo.room.energyCapacityAvailable)]
    }

    make(maxCost) {
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
    }

    getTotalAvgSpawnTime(roomInfo) {
        return this.getIdealSpawns(roomInfo).reduce(
            (total, curr) => total + creepSpawnUtility.getSpawnTime(curr.body), 0)
            / CREEP_LIFE_TIME;
    }
}

module.exports = UpgraderSpawnHandler;