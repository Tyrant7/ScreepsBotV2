const { getScoutingData } = require("./scouting.scoutingUtility");

module.exports = {
    getRemotePlans: function (colonyName) {
        if (!Memory.colonies[colonyName]) {
            Memory.colonies[colonyName] = {};
        }
        return Memory.colonies[colonyName].remotes;
    },

    setRemotePlans: function (colonyName, plansObject) {
        if (!Memory.colonies[colonyName]) {
            Memory.colonies[colonyName] = {};
        }
        Memory.colonies[colonyName].remotes = plansObject;
    },

    /**
     * Gets all valid remote rooms in Manhattan distance of 2.
     * @param {string} baseName Name of the room to get remotes for.
     * @param {(string) => boolean} validator How should remote rooms be qualified?
     * @returns {string[]} An array of room names.
     */
    getPotentialRemoteRooms: function (baseName, validator) {
        // Let's make a set containing all rooms in Manhattan distance of 2
        const nearbyRooms = [];
        for (const neighbour of Object.values(
            Game.map.describeExits(baseName)
        )) {
            if (validator(neighbour)) {
                nearbyRooms.push(neighbour);
            }
            for (const neighbourOfNeighbours of Object.values(
                Game.map.describeExits(neighbour)
            )) {
                if (
                    neighbourOfNeighbours !== baseName &&
                    !nearbyRooms.includes(neighbourOfNeighbours) &&
                    validator(neighbourOfNeighbours)
                ) {
                    nearbyRooms.push(neighbourOfNeighbours);
                }
            }
        }
        return nearbyRooms;
    },

    isValidRemoteRoom: function (roomName) {
        const remoteInfo = getScoutingData(roomName);
        if (!remoteInfo || !remoteInfo.lastVisit) {
            return false;
        }

        // No sources
        if (!remoteInfo.sources || !remoteInfo.sources.length) {
            return false;
        }

        // Source keepers
        if (
            (remoteInfo.sourceKeepers && remoteInfo.sourceKeepers.length) ||
            (remoteInfo.keeperLairs && remoteInfo.keeperLairs.length)
        ) {
            return false;
        }
        return true;
    },
};
