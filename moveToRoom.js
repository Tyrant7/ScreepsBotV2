module.exports = function(creep, data) {
    
    // Don't reassign when standing on an exit
    const leavingOrEntering = creep.pos.x >= 49 ||
                              creep.pos.x <= 0  ||
                              creep.pos.y >= 49 ||
                              creep.pos.y <= 0;

    if (!Memory.rooms[data.roomName] || (creep.room.name === data.roomName && !leavingOrEntering)) {
        return true;
    }

    const controller = Memory.rooms[data.roomName].controller;
    const moveTarget = controller ? controller.pos : { x: 25, y: 25 };
    const pos = new RoomPosition(moveTarget.x, moveTarget.y, data.roomName);
    creep.moveTo(pos, {
        range: 0,
        maxRooms: data.maxRooms ? data.maxRooms : 16,
    });
};