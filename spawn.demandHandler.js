const { roles } = require("./constants");

const DEFAULT_DEMANDS = {
    [roles.hauler]: 0.7,
    [roles.miner]: 0.65,
    [roles.upgrader]: 0.4,
};

const MIN_MAX_DEMAND = {
    [roles.miner]: { min: 0.5 },
    [roles.hauler]: { min: 0.5 },
    [roles.upgrader]: { min: 0.4 },
    [roles.builder]: { max: 2.5 },
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
    const constraints = MIN_MAX_DEMAND[role] || {};
    value = Math.max(value, constraints.min || 0);
    value = Math.min(value, constraints.max || Infinity);
    base.spawnDemand[role] = { freeze, value };
};

const getRoleDemand = (roomName, role) => {
    try {
        return Memory.bases[roomName].spawnDemand[role];
    } catch (e) {
        return undefined;
    }
};

const bumpRoleDemand = (roomName, role, amount, urgent = false) => {
    const demand = getRoleDemand(roomName, role);
    if (!demand) {
        setRoleDemand(roomName, role, amount);
        return;
    }
    if (demand.freeze > 0 && !urgent) {
        demand.freeze--;
        return;
    }
    const oldValue = demand.value || 0;
    setRoleDemand(roomName, role, oldValue + amount, NUDGE_RATE);
};

const nudgeRoleDemand = (roomName, role, amount, urgent = false) => {
    amount /= NUDGE_RATE;

    const demand = getRoleDemand(roomName, role);
    if (!demand) {
        setRoleDemand(roomName, role, amount);
        return;
    }
    if (demand.freeze > 0 && !urgent) {
        demand.freeze--;
        return;
    }
    const oldValue = (demand && demand.value) || 0;
    setRoleDemand(roomName, role, oldValue + amount, demand.freeze);
};

module.exports = {
    DEFAULT_DEMANDS,
    MIN_MAX_DEMAND,
    ensureDefaults,
    getRoleDemand,
    setRoleDemand,
    bumpRoleDemand,
    nudgeRoleDemand,
};
