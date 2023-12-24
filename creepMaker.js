class CreepMaker {

    makeWorker(maxLevel) {
        const workerParts = [WORK, CARRY, MOVE];
        let body = workerParts;
        let lvl = 1;
        const levelCost = getCost(body);

        while (lvl < maxLevel && lvl < workers.length && (lvl + 1) * levelCost <= room.energyCapacityAvailable) {
            lvl++;
            body = body.concat(workerParts);
        }
        return { body: body, 
                 cost: lvl * levelCost,
                 role: CONSTANTS.roles.worker,
                 name: "Worker" + Game.time + " [" + lvl.toString() + "]" };
    }

    makeMiner(workParts) {
        let body = [MOVE, MOVE, MOVE];
        for (const i in workParts) {
            body.push(WORK);
        }
        return { body: body, 
                 cost: this.getCost(body),
                 role: CONSTANTS.roles.miner,
                 name: "Miner " + Game.time + " [" + workParts + "]" };
    }

    makeClone(creep) {
        const body = creep.body;
        const cost = this.getCost(body);
        const oldName = cree.name.split(" ");
        const name = oldName[0] + Game.time + oldName[2];
        return { body: body, 
                 cost: cost,
                 role: creep.memory.role,
                 name: name };
    }

    getCost(body) {
        return _.sum(body.map((part) => BODYPART_COST[part]));
    }

    getSpawnTime(body) {
        return body.length * CREEP_SPAWN_TIME;
    }
}

module.exports = CreepMaker;