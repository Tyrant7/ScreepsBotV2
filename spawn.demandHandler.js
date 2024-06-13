const { roles } = require("./constants");

const DEFAULT_DEMANDS = {
    [roles.hauler]: 1,
    [roles.miner]: 1,
};

const FREEZE_TIME = 50;

const ensureDefaults = (roomName) => {
    for (const role of roles) {
        if (getRoleDemand(roomName, role) !== undefined) {
            continue;
        }
        const value = DEFAULT_DEMANDS[role] || 0;
        setRoleDemand(role, value);
    }
};

const setRoleDemand = (roomName, role, value, freeze = 0) => {
    const base = Memory.bases[roomName];
    if (!base) {
        return;
    }
    if (!base.spawnDemand) {
        base.spawnDemand = [];
    }
    base.spawnDemand[role] = { freeze, value };
};

const getRoleDemand = (roomName, role) => {
    try {
        return Memory.bases[roomName].spawnDemand[role].value;
    } catch {
        return undefined;
    }
};

const bumpRoleDemand = (roomName, role, amount) => {
    const oldValue = getRoleDemand() || 0;
    const freezeTime = Math.floor(FREEZE_TIME * amount);
    setRoleDemand(roomName, role, oldValue + amount, freezeTime);
};

module.exports = {
    ensureDefaults,
    getRoleDemand,
    bumpRoleDemand,
};
