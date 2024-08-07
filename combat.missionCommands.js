const { setHate } = require("./combat.missionUtility");

const registerMissionCommands = () => {
    global.SET_HATE = (player, hate) => {
        setHate(player, amount);
    };
};

module.exports = { registerMissionCommands };
