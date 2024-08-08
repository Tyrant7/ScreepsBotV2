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

const coolDown = (player) => {
    Memory.playerData[player].hate -= COOLDOWN_AMOUNT;
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
    return _.pick(Memory.missions, (m) => m.type === type);
};

const getMissionType = (roomName) => {
    if (!Memory.missions[roomName]) return 0;
    return Memory.missions[roomName].type;
};

const createMission = (roomName, type, supporters, spawnDemands) => {
    for (const supporter of supporters) {
        if (!Memory.colonies[supporter].missions) {
            Memory.colonies[supporter].missions = [];
        }
        if (!Memory.colonies[supporter].missions.includes(point)) {
            Memory.colonies[supporter].missions.push(point);
        }
    }
    Memory.missions[roomName] = {
        type,
        created: Game.time,
        supporters,
        spawnDemands,
        creepNamesAndRoles: [],
    };
};

const removeMission = (roomName) => {
    delete Memory.missions[roomName];
};

const getColoniesInRange = (point, maxDist, minRCL = 0) => {
    const supporters = [];
    for (const colony in Memory.colonies) {
        if (Memory.colonies[colony].rcl < minRCL) continue;
        const route = Game.map.findRoute(colony, point);
        if (route.length <= maxDist) {
            supporters.push(colony);
        }
    }
    return supporters;
};

const getAllPlayerRooms = (player) => {
    return _.pick(
        Memory.scoutData,
        (d) => d.controller && d.controller.owner === player
    );
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
    getColoniesInRange,
    getAllPlayerRooms,
};
