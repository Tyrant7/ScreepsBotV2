const { getAllMissions } = require("./mission.missionUtility");

class MissionManager {
    run() {
        // Filter out the creeps assigned to each mission to be only creeps still alive
        const allMissions = getAllMissions();
        for (const room in allMissions) {
            allMissions[room].creepNamesAndRoles = allMissions[
                room
            ].creepNamesAndRoles.filter((c) => Game.creeps[c.name]);
        }
    }
}

module.exports = MissionManager;
