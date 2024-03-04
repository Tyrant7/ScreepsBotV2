module.exports = {

    getRemotePlans: function(baseName) {
        return Memory.bases[baseName].remotes;
    },

    setRemotePlans: function(baseName, plansArray) {
        Memory.bases[baseName].remotes = plansArray;
    },

    /**
     * Returns true or false depending on whether or not a structure of this 
     * type has been planned at this position by this home room
     * @param {string} baseName The name of the home room.
     * @param {RoomPosition} pos The position of the planned structure.
     * @param {string} type One of the STRUCTURE_* constants.
     * @returns {boolean} True or false.
     */
    isStructurePlanned: function(baseName, pos, type) {

        // Make sure this base exists
        if (!Memory.bases[baseName]) {
            return false;
        }

        // Make sure it's a valid remote
        const remote = this.getRemotePlans(baseName).remotes[pos.roomName];
        if (!remote) {
            return false;
        }

        let searchCollection;
        if (type === STRUCTURE_ROAD) {
            searchCollection = remote.roads;
        }
        else if (type === STRUCTURE_CONTAINER) {
            searchCollection = remote.containers;
        }

        if (!searchCollection) {
            return false;
        }
        return !!searchCollection.find((r) => 
            r.x === pos.x && 
            r.y === pos.y && 
            r.roomName === pos.roomName);
    },
};