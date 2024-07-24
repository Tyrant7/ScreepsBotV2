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

const ensureDefaults = (colony) => {
    for (const role in roles) {
        if (getRoleDemand(colony, role) !== undefined) {
            continue;
        }
        const value = DEFAULT_DEMANDS[role] || 0;
        setRoleDemand(colony, role, value);
    }
};

const setRoleDemand = (colony, role, value, freeze = 0) => {
    if (!colony.memory.spawnDemand) {
        colony.memory.spawnDemand = {};
    }
    const constraints = MIN_MAX_DEMAND[role] || {};
    value = Math.max(value, constraints.min || 0);
    value = Math.min(value, constraints.max || Infinity);
    freeze = Math.max(freeze, 0);
    colony.memory.spawnDemand[role] = { freeze, value };
};

const getRoleDemand = (colony, role) => {
    try {
        return colony.memory.spawnDemand[role];
    } catch (e) {
        return undefined;
    }
};

const bumpRoleDemand = (colony, role, amount, urgent = false) => {
    const demand = getRoleDemand(colony, role);
    if (!demand) {
        setRoleDemand(colony, role, amount);
        return;
    }
    if (demand.freeze > 0 && !urgent) {
        demand.freeze--;
        return;
    }
    const oldValue = demand.value || 0;
    setRoleDemand(colony, role, oldValue + amount, NUDGE_RATE);
};

const nudgeRoleDemand = (colony, role, amount) => {
    amount /= NUDGE_RATE;

    const demand = getRoleDemand(colony, role);
    if (!demand) {
        setRoleDemand(colony, role, amount);
        return;
    }
    const oldValue = (demand && demand.value) || 0;
    setRoleDemand(colony, role, oldValue + amount, demand.freeze - 1);
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
