const { roles } = require("./constants");

const DEFAULT_DEMANDS = {
    [roles.hauler]: 0.9,
    [roles.miner]: 0.5,
};

const NUDGE_RATE = 250;

const ensureDefaults = (roomName) => {
    for (const role in roles) {
        if (getRoleDemand(roomName, role) !== undefined) {
            continue;
        }
        const value = DEFAULT_DEMANDS[role] || 0;
        setRoleDemand(roomName, role, value);
    }
};

const setRoleDemand = (roomName, role, value, freeze = 0) => {
    const base = Memory.bases[roomName];
    if (!base) {
        return;
    }
    if (!base.spawnDemand) {
        base.spawnDemand = {};
    }
    value = Math.max(value, 0);
    base.spawnDemand[role] = { freeze, value };
};

const getRoleDemand = (roomName, role) => {
    try {
        return Memory.bases[roomName].spawnDemand[role];
    } catch (e) {
        return undefined;
    }
};

const bumpRoleDemand = (roomName, role, amount) => {
    const demand = getRoleDemand(roomName, role);
    if (!demand) {
        setRoleDemand(roomName, role, amount);
        return;
    }
    if (demand.freeze > 0) {
        demand.freeze--;
        return;
    }
    const oldValue = demand.value || 0;
    const freezeTime = Math.floor(NUDGE_RATE * amount);
    setRoleDemand(roomName, role, oldValue + amount, freezeTime);
};

const nudgeRoleDemand = (roomName, role, amount) => {
    amount /= NUDGE_RATE;

    const demand = getRoleDemand(roomName, role);
    if (!demand) {
        setRoleDemand(roomName, role, amount);
        return;
    }
    if (demand.freeze > 0) {
        demand.freeze--;
        return;
    }
    const oldValue = (demand && demand.value) || 0;
    setRoleDemand(roomName, role, oldValue + amount);
};

module.exports = {
    ensureDefaults,
    getRoleDemand,
    setRoleDemand,
    bumpRoleDemand,
    nudgeRoleDemand,
};
