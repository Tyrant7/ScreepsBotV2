const { setHate } = require("./combat.missionUtility");

const registerMissionCommands = () => {
    global.SET_HATE = (player, amount) => {
        setHate(player, amount);
    };
};

module.exports = { registerMissionCommands };
