module.exports = function(creep, data) {
    
    // Don't reassign when standing on an exit
    const leavingOrEntering = creep.pos.x >= 49 ||
                              creep.pos.x <= 0  ||
                              creep.pos.y >= 49 ||
                              creep.pos.y <= 0;

    if (!Memory.rooms[data.roomName] || creep.room.name === data.roomName && !leavingOrEntering) {
        return true;
    }

    const moveTarget = Memory.rooms[data.roomName].controller.pos;
    const pos = new RoomPosition(moveTarget.x, moveTarget.y, data.roomName);
    creep.moveTo(pos);
};