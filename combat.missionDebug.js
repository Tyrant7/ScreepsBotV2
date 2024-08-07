const { MISSION_TYPES } = require("./combat.missionConstants");
const { getAllMissions } = require("./combat.missionUtility");
const { drawArrow } = require("./debug.mapOverlay");

const COLOR_BY_MISSION_TYPE = {
    [MISSION_TYPES.COLONIZE]: "6BEB2A",
    [MISSION_TYPES.KILL]: "EE1111",
};

const showMissionTargets = () => {
    const allMissions = getAllMissions();
    for (const mission in allMissions) {
        for (const colony of allMissions[mission].data.supporters) {
            drawArrow(mission, colony, {
                color: COLOR_BY_MISSION_TYPE[allMissions[mission].type],
                lineStyle: "dotted",
                width: 1.5,
            });
        }
    }
};

module.exports = {
    showMissionTargets,
};
