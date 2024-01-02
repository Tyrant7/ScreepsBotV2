class CreepMaker {

    makeWorker(maxLevel, energyCapacity) {
        const workerParts = [WORK, CARRY, MOVE];
        let body = workerParts;
        let lvl = 1;
        const levelCost = this.getCost(body);

        while (lvl < maxLevel && (lvl + 1) * levelCost <= energyCapacity) {
            lvl++;
            body = body.concat(workerParts);
        }
        return { body: body, 
                 cost: lvl * levelCost,
                 name: "Worker" + Game.time + " [" + lvl.toString() + "]",
                 memory: { role: CONSTANTS.roles.worker }};
    }

    makeMiner(workParts, energyCapacity) {
        let body = [MOVE, MOVE, MOVE];
        for (let i = 0; i < workParts; i++) {
            body.push(WORK);
            if (this.getCost(body) > energyCapacity) {
                body.pop();
                break;
            }
        }
        return { body: body, 
                 cost: this.getCost(body),
                 name: "Miner " + Game.time + " [" + workParts + "]",
                 memory: { role: CONSTANTS.roles.miner }};
    }

    makeClone(creep) {
        const body = creep.body;
        const cost = this.getCost(body);
        const oldName = creep.name.split(" ");
        const name = oldName[0] + Game.time + oldName[2];
        return { body: body, 
                 cost: cost,
                 name: name,
                 memory: creep.memory };
    }

    getCost(body) {
        return _.sum(body.map((part) => BODYPART_COST[part]));
    }

    getSpawnTime(body) {
        return body.length * CREEP_SPAWN_TIME;
    }
}

module.exports = CreepMaker;