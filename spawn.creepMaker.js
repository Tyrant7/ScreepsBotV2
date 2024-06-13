const { getCost } = require("./spawn.spawnUtility");
const { MINER_WORK } = require("./spawn.spawnConstants");
const { roles, maxLevels } = require("./constants");

//#region Energy Production

const makeMiner = (energy) => {
    const body = [];
    let lvl = 0;
    for (let i = 0; i < MINER_WORK / 2; i++) {
        lvl++;
        body.push(WORK, WORK, MOVE);
        if (getCost(body) > energy) {
            lvl--;
            body.pop();
            body.pop();
            body.pop();
            break;
        }
    }
    body.push(CARRY);
    if (getCost(body) > energy) {
        body.pop();
    }
    return {
        body: body,
        name: "Miner " + Game.time + " [" + lvl + "]",
        memory: { role: roles.miner },
    };
};

const makeHauler = (energy) => {
    const body = [];
    let lvl = 0;
    for (let i = 0; i < maxLevels.hauler; i++) {
        lvl = i + 1;
        body.push(MOVE, CARRY, CARRY);
        if (getCost(body) > energy || body.length > MAX_CREEP_SIZE) {
            lvl--;
            body.pop();
            body.pop();
            body.pop();
            break;
        }
    }
    return {
        body: body,
        name: "Hauler " + Game.time + " [" + lvl + "]",
        memory: { role: roles.hauler },
    };
};

const makeReserver = () => {
    // It's technically possible with 1 CLAIM 1 MOVE, but give it extra to account for
    // imperfections in pathing and spawning priorities
    return {
        body: [MOVE, CLAIM, MOVE, CLAIM],
        name: "Reserver " + Game.time + " [2]",
        memory: { role: roles.reserver },
    };
};

//#endregion

//#region Development

const makeUpgrader = (energy) => {
    if (energy < 550) {
        return makeMiniUpgrader();
    }
    const body = [CARRY, CARRY];
    let lvl = 0;
    while (lvl < maxLevels.upgrader) {
        lvl++;
        body.push(MOVE, WORK, WORK, WORK, WORK);
        if (getCost(body) > energy || body.length > MAX_CREEP_SIZE) {
            lvl--;
            body.pop();
            body.pop();
            body.pop();
            body.pop();
            body.pop();
            break;
        }
    }
    return {
        body: body,
        name: "Upgrader " + Game.time + " [" + lvl + "]",
        memory: { role: roles.upgrader },
    };
};

const makeMiniUpgrader = () => {
    return {
        body: [CARRY, MOVE, WORK, WORK],
        name: "Mini_Upgrader " + Game.time + " [1]",
        memory: { role: roles.upgrader },
    };
};

const makeBuilder = (energy) => {
    const builderParts = [WORK, CARRY, MOVE];
    let body = builderParts;
    let lvl = 1;
    const levelCost = getCost(body);
    while (
        lvl < maxLevels.builder &&
        (lvl + 1) * levelCost <= energy &&
        body.length <= MAX_CREEP_SIZE - builderParts.length
    ) {
        lvl++;
        body = body.concat(builderParts);
    }
    return {
        body: body,
        name: "Builder " + Game.time + " [" + lvl + "]",
        memory: { role: roles.builder },
    };
};

const makeRepairer = (energy) => {
    const body = [];
    let lvl = 0;
    for (let i = 0; i < maxLevels.repairer; i++) {
        lvl = i + 1;
        body.push(MOVE, CARRY, CARRY, WORK);
        if (getCost(body) > energy) {
            body.pop();
            body.pop();
            body.pop();
            body.pop();
            break;
        }
    }
    return {
        body: body,
        name: "Repairer " + Game.time + " [" + lvl + "]",
        memory: { role: roles.repairer },
    };
};

const makeMineralMiner = (energy) => {
    const body = [];
    let lvl = 0;
    while (lvl < maxLevels.mineralMiner) {
        lvl++;
        body.push(...[MOVE, WORK, WORK, WORK, WORK]);
        if (getCost(body) > energy || body.length > MAX_CREEP_SIZE) {
            lvl--;
            body.pop();
            body.pop();
            body.pop();
            body.pop();
            body.pop();
            break;
        }
    }
    return {
        body: body,
        name: "Excavator " + Game.time + " [" + lvl + "]",
        memory: { role: roles.mineralMiner },
    };
};

//#endregion

//#region Expansion

const makeScout = () => {
    return {
        body: [MOVE],
        name: "Scout " + Game.time + " [1]",
        memory: { role: roles.scout },
    };
};

//#endregion

//#region Defense

const makeMiniDefender = (desiredLevel, maxCost) => {
    const body = [];
    let lvl = 0;
    for (let i = 0; i < desiredLevel; i++) {
        lvl = i + 1;
        body.push(
            MOVE,
            RANGED_ATTACK,
            RANGED_ATTACK,
            MOVE,
            RANGED_ATTACK,
            HEAL
        );
        if (getCost(body) > maxCost) {
            for (let i = 0; i < 6; i++) {
                body.pop();
            }
            break;
        }
    }
    return {
        body: body,
        name: "Baby_Defender " + Game.time + " [" + lvl + "]",
        memory: { role: roles.defender },
    };
};

//#endregion

module.exports = {
    makeMiner,
    makeHauler,
    makeReserver,
    makeUpgrader,
    makeBuilder,
    makeRepairer,
    makeMineralMiner,
    makeScout,
    makeMiniDefender,
};
