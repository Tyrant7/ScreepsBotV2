// Range can't easily be calculated between rooms, unfortunately, so we'll just estimate
module.exports = function estimateTravelTime(creep, pos) {

    // Don't need to estimate
    if (creep.pos.roomName === pos.roomName) {
        return creep.pos.getRangeTo(pos);
    }
    const creepRoomPos = roomNameToXY(creep.pos.roomName);
    const posRoomPos = roomNameToXY(pos.roomName);
    const diffX = (Math.abs(creepRoomPos[0] - posRoomPos[0]) * 50);
    const diffY = (Math.abs(creepRoomPos[1] - posRoomPos[1]) * 50);
    return Math.max(diffX, diffY);
}

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
    if (horizontalDir === 'W' || horizontalDir === 'w') {
        xx = -xx - 1;
    }
    if (verticalDir === 'N' || verticalDir === 'n') {
        yy = -yy - 1;
    }
    return [xx, yy];
}