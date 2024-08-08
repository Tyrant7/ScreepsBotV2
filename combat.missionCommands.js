const { setHate } = require("./combat.missionUtility");

global.SET_HATE = (player, amount) => {
    setHate(player, amount);
};
