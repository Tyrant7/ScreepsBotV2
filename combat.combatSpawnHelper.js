const { roles } = require("./constants");
const { getAllMissions } = require("./mission.missionUtility");
const { getScoutingData } = require("./scouting.scoutingUtility");
const { makeDuoFollower, makeDuoLeader } = require("./spawn.creepMaker");

const makeDuo = (colony, missionRoom) => {
    const mission = getAllMissions()[missionRoom];
    const existingDuos = mission.creepNamesAndRoles.filter(
        (c) => c.role === roles.combatDuo
    );
    const leaders = existingDuos.filter(
        (d) => Game.creeps[d.name].memory.superior
    ).length;
    const followers = existingDuos.length - leaders;

    // Five parts to tank for each tower
    const roomData = getScoutingData(missionRoom);
    const parts = Math.max(roomData.towers, 1) * 5;

    // If we have more leaders than followers, let's make a follower, otherwise, let's make a leader
    // This ensures that our duos will spawn in pairs
    return leaders > followers ||
        // Also don't allow us to spawn our follower and leader in a different room
        !colony.combatDuos.find((c) => c.memory.superior)
        ? makeDuoFollower(parts)
        : makeDuoLeader(parts, WORK);
};

module.exports = { makeDuo };
