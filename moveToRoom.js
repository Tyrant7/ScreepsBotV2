module.exports = function(creep, target) {
    
    // Don't reassign when standing on an exit
    const leavingOrEntering = creep.pos.x >= 49 ||
                              creep.pos.x <= 0  ||
                              creep.pos.y >= 49 ||
                              creep.pos.y <= 0;

    if (creep.room.name === target && !leavingOrEntering) {
        return true;
    }
    const moveTarget = Memory.rooms[target].controller.pos;
    const pos = new RoomPosition(moveTarget.x, moveTarget.y, target);
    creep.moveTo(pos);
};