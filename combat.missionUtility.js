const {
    COOLDOWN_AMOUNT,
    HATE_FOR_ATTACKER,
    HATE_FOR_SCOUT,
    HATE_FOR_THIEF,
    MAX_MISSIONS,
} = require("./combat.missionConstants");

const verifyPlayerDataExists = (player) => {
    if (Memory.playerData[player]) return;
    Memory.playerData[player] = {
        hate: 0,
    };
};

const getAllPlayerData = () => {
    return Memory.playerData;
};

const addHate = (player, amount) => {
    verifyPlayerDataExists(player);
    Memory.playerData[player].hate += amount;
};

const coolDown = (amount) => {
    for (const player in Memory.playerData) {
        Memory.playerData[player].hate -= COOLDOWN_AMOUNT;
    }
};

/**
 * Determines the amount of hate to give for an enemy creep in our room.
 * @param {Creep} enemy The enemy creep.
 * @returns {number} The amount of hate.
 */
const determineHateType = (enemy) => {
    if (
        enemy.body.find(
            (part) =>
                part.type === ATTACK ||
                part.type === HEAL ||
                part.type === RANGED_ATTACK ||
                part.type === WORK
        )
    )
        return HATE_FOR_ATTACKER;
    if (enemy.body.find((part) => part.type === CARRY)) return HATE_FOR_THIEF;
    return HATE_FOR_SCOUT;
};

const getMissions = () => {
    return Memory.missions;
};

const createMission = (player, type) => {
    if (Object.keys(Memory.missions) >= MAX_MISSIONS) return;
    Memory.missions[player] = type;
};

module.exports = {
    verifyPlayerDataExists,
    getAllPlayerData,
    addHate,
    coolDown,
    determineHateType,
    getMissions,
    createMission,
};
