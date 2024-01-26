module.exports = {
    /**
     * Performs a breadth-first search of neighbouring rooms until an unexplored room has been found.
     * @param {string} startingRoom The name of the room to start in.
     * @param {number} maxIterations The max iterations to search for. After this, null will be returned.
     * @returns 
     */
    searchForUnexploredRoomsNearby: function(startingRoom, maxIterations) {

        // Perform a breadth-first search of neighbouring rooms
        // If all of them have been explored, repeat with their neighbours
        // Continue until an unexplored room has been found
        let current = Object.values(Game.map.describeExits(startingRoom));
        for (let i = 0; i < maxIterations; i++) {
            let next = [];
            for (const room of current) {
                if (!Memory.rooms[room]) {
                    return room;
                }
                next.push(...Object.values(Game.map.describeExits(room)));
            }
            current = next;
        }

        // None found before maxIterations expired
        return null;
    }
}