const { ROOM_SIZE } = require("./constants");
const { roomNameToXY } = require("./util.roomNameToXY");

// Range can't easily be calculated between rooms, unfortunately, so we'll just estimate
module.exports = function estimateTravelTime(pos1, pos2) {
    // Don't need to estimate
    if (pos1.roomName === pos2.roomName) {
        return pos1.getRangeTo(pos2);
    }
    const pos1RoomPos = roomNameToXY(pos1.roomName);
    const pos2RoomPos = roomNameToXY(pos2.roomName);
    const diffX = Math.abs(
        pos1RoomPos.xx * ROOM_SIZE +
            pos1.x -
            (pos2RoomPos.xx * ROOM_SIZE + pos2.x)
    );
    const diffY = Math.abs(
        pos1RoomPos.yy * ROOM_SIZE +
            pos1.y -
            (pos2RoomPos.yy * ROOM_SIZE + pos2.y)
    );
    return Math.max(diffX, diffY);
};
