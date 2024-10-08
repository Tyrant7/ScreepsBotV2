const { getCost } = require("./spawn.spawnUtility");
const { MINER_WORK } = require("./spawn.spawnConstants");
const { roles, maxLevels } = require("./constants");

//#region Energy Production

const makeMiner = (energy, carryPart = true) => {
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
    if (carryPart) {
        body.push(CARRY);
        if (getCost(body) > energy) {
            body.pop();
        }
    }
    return {
        body: body,
        name: "Miner " + Game.time + " [" + lvl + "]",
        memory: { role: roles.miner },
    };
};

const makeHauler = (energy, ratio = 2) => {
    const body = [];
    let lvl = 0;
    for (let i = 0; i < maxLevels.hauler; i++) {
        lvl = i + 1;
        body.push(MOVE);
        for (let j = 0; j < ratio; j++) {
            body.push(CARRY);
        }
        if (getCost(body) > energy || body.length > MAX_CREEP_SIZE) {
            lvl--;
            for (let j = 0; j < ratio + 1; j++) {
                body.pop();
            }
            break;
        }
    }
    return {
        body: body,
        name: "Hauler " + Game.time + " [" + lvl + "]",
        memory: { role: roles.hauler },
    };
};

const makeStarterHauler = () => {
    return {
        body: [MOVE, CARRY],
        name: "Baby_Hauler " + Game.time + " [" + 1 + "]",
        memory: { role: roles.starterHauler },
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
    // Special configuration is more efficient for low energy rooms
    if (energy < 550) {
        return {
            body: [CARRY, MOVE, WORK, WORK],
            name: "Upgrader " + Game.time + " [0]",
            memory: { role: roles.upgrader },
        };
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

const makeBuilder = (energy) => {
    const builderParts = [WORK, CARRY, CARRY, CARRY, MOVE];
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
        body.push(MOVE, CARRY, CARRY, CARRY, WORK);
        if (getCost(body) > energy) {
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
        name: "Repairer " + Game.time + " [" + lvl + "]",
        memory: { role: roles.repairer },
    };
};

const makeMineralMiner = (energy) => {
    const body = [];
    let lvl = 0;
    while (lvl < maxLevels.mineralMiner) {
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

const makeClaimer = (missionRoom) => {
    return {
        body: [MOVE, CLAIM],
        name: "Claimer " + Game.time + " [1]",
        memory: { role: roles.claimer, mission: missionRoom },
    };
};

const makeColonizerBuilder = (energy, missionRoom) => {
    const builderBody = makeBuilder(energy).body;
    const level = builderBody.filter((p) => p === WORK).length;
    return {
        body: builderBody,
        name: "C_Builder " + Game.time + " [" + level + "]",
        memory: { role: roles.colonizerBuilder, mission: missionRoom },
    };
};

const makeColonizerDefender = (energy, missionRoom) => {
    const defenderBody = makeMiniDefender(Infinity, energy).body;
    const level = defenderBody.filter((p) => p === HEAL).length;
    return {
        body: defenderBody,
        name: "C_Defender " + Game.time + " [" + level + "]",
        memory: { role: roles.colonizerDefender, mission: missionRoom },
    };
};

//#endregion

//#region Defense

const makeMiniDefender = (desiredLevel, maxCost) => {
    const body = [];
    let lvl = 0;
    for (let i = 0; i < desiredLevel; i++) {
        lvl = i + 1;
        body.push(MOVE, RANGED_ATTACK, MOVE, MOVE, RANGED_ATTACK, HEAL);
        if (getCost(body) > maxCost || body.length > MAX_CREEP_SIZE) {
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

const makeCleaner = (energy) => {
    const body = [];
    let lvl = 0;
    while (lvl < maxLevels.cleaner) {
        lvl++;
        body.push(MOVE, ATTACK);
        if (getCost(body) > energy || body.length > MAX_CREEP_SIZE) {
            lvl--;
            body.pop();
            body.pop();
            break;
        }
    }
    return {
        body: body,
        name: "Cleaner " + Game.time + " [" + lvl + "]",
        memory: { role: roles.cleaner },
    };
};

//#endregion

//#region Offense

// Military creeps are a little different for a few reasons
// 1. We need to spawn them at a certain size, so we'll specify a part count as a parameter
// 2. We need to specify the part types, since there are different types of duos, quads, etc.
// 3. They spawn in groups, so we'll also specify the type of creep within each group,
//    as a duo leader, duo follower, etc.
// 4. They spawn as part of a mission, so we'll take a mission parameter;
//    this also goes for expansion creeps

const makeDuoLeader = (size, partType, missionRoom) => {
    const body = [];
    for (let i = 0; i < Math.min(size, MAX_CREEP_SIZE); i++) {
        body.push(MOVE, partType);
    }
    return {
        body,
        name: `Duo_Leader ${Game.time} [${size}]`,
        memory: { role: roles.combatDuo, superior: true, mission: missionRoom },
    };
};

const makeDuoFollower = (size, missionRoom) => {
    const body = [];
    for (let i = 0; i < Math.min(size, MAX_CREEP_SIZE); i++) {
        body.push(MOVE, HEAL);
    }
    return {
        body,
        name: `Duo_Follower ${Game.time} [${size}]`,
        memory: {
            role: roles.combatDuo,
            superior: false,
            mission: missionRoom,
        },
    };
};

//#endregion

const RESERVER_COST = getCost(makeReserver().body);
const CLAIMER_COST = getCost(makeClaimer().body);

module.exports = {
    makeMiner,
    makeHauler,
    makeStarterHauler,
    makeReserver,
    makeUpgrader,
    makeBuilder,
    makeRepairer,
    makeMineralMiner,
    makeScout,
    makeMiniDefender,
    makeCleaner,
    makeClaimer,
    makeColonizerBuilder,
    makeColonizerDefender,
    makeDuoLeader,
    makeDuoFollower,
    RESERVER_COST,
    CLAIMER_COST,
};
