module.exports = {
    getRemotePlans: function (baseName) {
        if (!Memory.bases[baseName]) {
            Memory.bases[baseName] = {};
        }
        return Memory.bases[baseName].remotes;
    },

    setRemotePlans: function (baseName, plansObject) {
        if (!Memory.bases[baseName]) {
            Memory.bases[baseName] = {};
        }
        Memory.bases[baseName].remotes = plansObject;
    },

    clearRemotePlans: function () {
        for (const base in Memory.bases) {
            delete Memory.bases[base].remotes;
        }
    },

    /**
     * Returns true or false depending on whether or not a structure of this
     * type has been planned at this position by this home room
     * @param {string} baseName The name of the home room.
     * @param {RoomPosition} pos The position of the planned structure.
     * @param {string} type One of the STRUCTURE_* constants.
     * @returns {boolean} True or false.
     */
    isStructurePlanned: function (baseName, pos, type) {
        // Make sure we have plans and it's an actual remote
        const plans = this.getRemotePlans(baseName);
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
};
