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
     * Returns true or false depending on whether or not a structure of this
     * type has been planned at this position by this home room
     * @param {string} colonyName The name of the colony room.
     * @param {RoomPosition} pos The position of the planned structure.
     * @param {string} type One of the STRUCTURE_* constants.
     * @returns {boolean} True or false.
     */
    isStructurePlanned: function (colonyName, pos, type) {
        // Make sure we have plans and it's an actual remote
        const plans = this.getRemotePlans(colonyName);
        if (!plans) {
            return false;
        }

        if (type !== STRUCTURE_ROAD && type !== STRUCTURE_CONTAINER) {
            return false;
        }

        // Very inefficient, might need to // FIX // later
        for (const remote of plans) {
            if (!remote.active) {
                continue;
            }
            const result =
                type === STRUCTURE_ROAD
                    ? remote.roads.find(
                          (r) =>
                              r.x === pos.x &&
                              r.y === pos.y &&
                              r.roomName === pos.roomName
                      )
                    : remote.container.x === pos.x &&
                      remote.container.y === pos.y &&
                      remote.container.roomName === pos.roomName;
            if (result) {
                return true;
            }
        }
        return false;
    },

    /**
     * Gets all valid remote rooms in Manhattan distance of 2.
     * @param {string} baseName Name of the room to get remotes for.
     * @param {boolean?} filterChoices Should the search filter for valid rooms or just include all of them?
     * @returns {string[]} An array of room names.
     */
    getPotentialRemoteRooms: function (baseName, filterChoices = true) {
        const isValidRemote = (roomName) => {
            if (!filterChoices) {
                return true;
            }

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
        };

        // Let's make a set containing all rooms in Manhattan distance of 2
        const nearbyRooms = [];
        for (const neighbour of Object.values(
            Game.map.describeExits(baseName)
        )) {
            if (isValidRemote(neighbour)) {
                nearbyRooms.push(neighbour);
            }
            for (const neighbourOfNeighbours of Object.values(
                Game.map.describeExits(neighbour)
            )) {
                if (
                    neighbourOfNeighbours !== baseName &&
                    !nearbyRooms.includes(neighbourOfNeighbours) &&
                    isValidRemote(neighbourOfNeighbours)
                ) {
                    nearbyRooms.push(neighbourOfNeighbours);
                }
            }
        }
        return nearbyRooms;
    },
};
