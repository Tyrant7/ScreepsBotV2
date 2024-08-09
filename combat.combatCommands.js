const { setHate } = require("./combat.combatUtility");

global.SET_HATE = (player, amount) => {
    setHate(player, amount);
};
