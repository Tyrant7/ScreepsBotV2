// Make sure we have some default options that can be overridden for our movement
const defaultOptions = {
    reusePath: 50,
    ignoreCreeps: true,
};

Creep.prototype.wrappedMoveTo = Creep.prototype.moveTo;
Creep.prototype.moveTo = function(target, options = defaultOptions) {

    // Force our passed options to implement our defaults if none were specified
    for (const key in defaultOptions) {
        if (!options[key]) {
            options[key] = defaultOptions[key];
        }
    }

    this.wrappedMoveTo(target, options);
    const moveData = this.memory._move;
    if (!moveData) {
        return;
    }

    // Check if we moved when we wanted to
    if (moveData.path) {
        
        // If there's a creep standing where we want to go, let's request a shove
        const path = Room.deserializePath(moveData.path);
        const nextStep = path[0];
        const blockingCreep = this.room.lookForAt(LOOK_CREEPS, nextStep.x, nextStep.y).find((c) => c !== this && c.my);
        if (blockingCreep && !blockingCreep.memory._move) {
            requestShove(this, blockingCreep);
        }
    }
}

function requestShove(shover, shoved) {

    console.log(shover.name + " requesting shove at " + shoved.name);
}