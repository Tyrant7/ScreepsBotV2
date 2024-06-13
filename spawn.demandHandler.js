const { roles } = require("./constants");

const DEFAULT_DEMANDS = {
    [roles.hauler]: 1,
    [roles.miner]: 1,
};

const NUDGE_RATE = 300;

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
        return Memory.bases[roomName].spawnDemand[role];
    } catch {
        return undefined;
    }
};

const bumpRoleDemand = (roomName, role, amount) => {
    const demand = getRoleDemand(roomName, role);
    const oldValue = (demand && demand.value) || 0;
    const freezeTime = Math.floor(NUDGE_RATE * amount);
    setRoleDemand(roomName, role, oldValue + amount, freezeTime);
};

const updateDemands = (roomName, demandHandlers) => {
    for (const role in demandHandlers) {
        const demand = getRoleDemand(roomName, role);
        if (!demand) {
            setRoleDemand(roomName, role, 0);
            continue;
        }
        if (demand.freeze > 0) {
            demand.freeze--;
            continue;
        }
        const amount = demandHandlers[role]();
        const oldValue = (demand && demand.value) || 0;
        const freeze = (demand && demand.freeze) || 0;
        const newValue = oldValue + amount / NUDGE_RATE;
        setRoleDemand(roomName, role, newValue, freeze);
    }
};

module.exports = {
    ensureDefaults,
    getRoleDemand,
    bumpRoleDemand,
    updateDemands,
};
