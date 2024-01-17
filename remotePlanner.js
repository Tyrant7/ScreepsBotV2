class RemotePlanner {

    planRemotes(roomInfo) {

        // Get adjacent rooms
        const room = roomInfo.room;
        const adjacentRooms = Object.values(Game.map.describeExits(room.name));

    }


}

module.exports = RemotePlanner;