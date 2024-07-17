/**
 * Performs a breadth-first search of neighbouring rooms until an unexplored room has been found.
 * @param {string} startRoomName The name of the room to start in.
 * @param {number} maxDepth The max iterations to search for. After this, null will be returned.
 * @returns {string} The name of the first unexplored room found.
 */
const searchForUnexploredRoomsNearby = (startRoomName, maxDepth) => {
    let current = Object.values(Game.map.describeExits(startRoomName));
    for (let i = 0; i < maxDepth; i++) {
        let next = [];
        for (const room of current) {
            if (!Memory.scoutData[room]) {
                return room;
            }
            next.push(...Object.values(Game.map.describeExits(room)));
        }
        current = next;
    }

    // None found before maxDepth expired
    return null;
};

const getScoutingData = (roomName) => {
    return Memory.scoutData[roomName];
};

const setScoutingData = (roomName, newData) => {
    Memory.scoutDate[roomName] = newData;
};

module.exports = {
    searchForUnexploredRoomsNearby,
    getScoutingData,
    setScoutingData,
};
