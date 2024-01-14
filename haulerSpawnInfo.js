const creepSpawnUtility = require("creepSpawnUtility");

class HaulerSpawnInfo {

    getPriority(roomInfo) {

        // No workers, no haulers
        const workerCount = roomInfo.workers.length;
        if (!workerCount) {
            return 0;
        }

        // Same for miners
        const minerCount = roomInfo.miners.length;
        if (!minerCount) {
            return 0;
        }

        // An estimation for how much energy haulers would carry per part on average per tick
        const neededCarryParts = roomInfo.getMaxIncome() / 20;
        const haulerBody = this.make(roomInfo);
        if (!haulerBody) {
            return 0;
        }
        const neededHaulers = neededCarryParts / haulerBody.body.filter((p) => p === CARRY).length;
        return (minerCount * 4) + (workerCount * 1) + (neededHaulers * 1);
    }

    make(roomInfo) {

        // Figure out how many WORK parts we have on workers
        const existingWork = roomInfo.workers.reduce((total, curr) => total + curr.body.filter((p) => p.type === WORK).length, 0);

        // Figure out how many CARRY parts we have on haulers
        const existingCarry = roomInfo.haulers.reduce((total, curr) => total + curr.body.filter((p) => p.type === CARRY).length, 0);

        // TODO: Calculate dynamically based on roads and accessibility //
        const carryToWorkRatio = 3 / 2;

        // Figure out how many CARRY parts is ideal given our ratio
        const wantedCarry = Math.ceil(existingWork / carryToWorkRatio) - existingCarry;
        if (wantedCarry <= 0) {
            return;
        }

        // Don't make haulers too big, even if we're able to
        const nextCarry = Math.min(wantedCarry, CONSTANTS.maxHaulerSize);

        // Create our body and composition
        let body = [MOVE, CARRY, CARRY];
        let lvl = 1;
        for (let i = 0; i < nextCarry; i++) {
            body.push(MOVE, CARRY, CARRY);
            lvl = i + 2;
            if (creepSpawnUtility.getCost(body) > roomInfo.room.energyCapacityAvailable) {
                body.pop();
                body.pop();
                body.pop();
                break;
            }
        }
        return { body: body, 
                 cost: creepSpawnUtility.getCost(body), 
                 name: "Hauler " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.hauler }};
    }
}

module.exports = HaulerSpawnInfo;