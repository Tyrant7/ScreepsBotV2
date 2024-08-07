const {
    COOLDOWN_AMOUNT,
    HATE_FOR_ATTACKER,
    HATE_FOR_SCOUT,
    HATE_FOR_THIEF,
} = require("./combat.missionConstants");

const verifyPlayerDataExists = (player) => {
    if (Memory.playerData[player]) return;
    Memory.playerData[player] = {
        hate: 0,
    };
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

module.exports = {
    verifyPlayerDataExists,
    addHate,
    coolDown,
    determineHateType,
};
