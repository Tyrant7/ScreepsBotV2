const { COOLDOWN_AMOUNT } = require("./combat.missionConstants");

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

module.exports = {
    verifyPlayerDataExists,
    addHate,
    coolDown,
};
