// Range can't easily be calculated between rooms, unfortunately, so we'll just estimate
module.exports = function estimateTravelTime(pos1, pos2) {
    // Don't need to estimate
    if (pos1.roomName === pos2.roomName) {
        return pos1.getRangeTo(pos2);
    }
    const pos1RoomPos = roomNameToXY(pos1.roomName);
    const pos2RoomPos = roomNameToXY(pos2.roomName);
    const diffX = Math.abs(
        pos1RoomPos[0] * 50 + pos1.x - (pos2RoomPos[0] * 50 + pos2.x)
    );
    const diffY = Math.abs(
        pos1RoomPos[1] * 50 + pos1.y - (pos2RoomPos[1] * 50 + pos2.y)
    );
    return Math.max(diffX, diffY);
};

// Function to convert room name to coords taken from Screeps Engine
function roomNameToXY(name) {
    let xx = parseInt(name.substr(1), 10);
    let verticalPos = 2;
    if (xx >= 100) {
        verticalPos = 4;
    } else if (xx >= 10) {
        verticalPos = 3;
    }
    let yy = parseInt(name.substr(verticalPos + 1), 10);
    let horizontalDir = name.charAt(0);
    let verticalDir = name.charAt(verticalPos);
    if (horizontalDir === "W" || horizontalDir === "w") {
        xx = -xx - 1;
    }
    if (verticalDir === "N" || verticalDir === "n") {
        yy = -yy - 1;
    }
    return [xx, yy];
}
