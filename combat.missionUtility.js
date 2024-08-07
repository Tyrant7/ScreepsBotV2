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

const setHate = (player, amount) => {
    verifyPlayerDataExists(player);
    Memory.playerData[player].hate = amount;
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

const getAllMissions = () => {
    return Memory.missions;
};

const getAllMissionsOfType = (type) => {
    return _.pick(Memory.missions, (k) => Memory.missions[k].type === type);
};

const getMissionType = (roomName) => {
    if (!Memory.missions[roomName]) return 0;
    return Memory.missions[roomName].type;
};

const createMission = (roomName, type, data) => {
    if (Object.keys(Memory.missions).length >= MAX_MISSIONS) return;
    Memory.missions[roomName] = { type, ...data };
};

const removeMission = (roomName) => {
    delete Memory.missions[roomName];
};

module.exports = {
    verifyPlayerDataExists,
    getAllPlayerData,
    addHate,
    setHate,
    coolDown,
    determineHateType,
    getAllMissions,
    getAllMissionsOfType,
    getMissionType,
    createMission,
    removeMission,
};
