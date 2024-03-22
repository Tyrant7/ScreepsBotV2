// Make sure we have some default options that can be overridden for our movement
const defaultOptions = {
    reusePath: 50,
    ignoreCreeps: true,
};

let moveRegistry = {};
let registryTick = -1;

Creep.prototype.wrappedMoveTo = Creep.prototype.moveTo;
Creep.prototype.moveTo = function(target, options = defaultOptions) {
    if (!(target instanceof RoomPosition)) {
        target = target.pos;
        if (!target) {
            console.log("Invalid target: " + target);
            return;
        }
    }

    // Reset the move registry if not yet this tick
    if (registryTick !== Game.time) {
        moveRegistry = {};
        registryTick = Game.time;
    }

    // Force our passed options to implement our defaults if none were specified
    for (const key in defaultOptions) {
        if (!options[key]) {
            options[key] = defaultOptions[key];
        }
    }

    // Save our shove target in case we get shoved
    this.memory._shoveTarget = target;
    this.wrappedMoveTo(target, options);
}
Creep.prototype.wrappedMove = Creep.prototype.move;
Creep.prototype.move = function(direction) {

    drawArrow(this.pos, direction);

    // Record ourselves in the move registry
    moveRegistry[this.name] = true;

    // Do our ordinary move
    this.wrappedMove(direction);

    // If there's a creep standing where we want to go, let's request a shove
    this.shoveIfNecessary(getPosInDirection(this.pos, direction));
}
Creep.prototype.shoveIfNecessary = function(targetPos) {

    const blockingCreep = this.room.lookForAt(LOOK_CREEPS, targetPos.x, targetPos.y).find((c) => c.my);
    if (blockingCreep) {

        // Let's make sure that this creep hasn't scheduled a move already
        if (registryTick === Game.time && moveRegistry[blockingCreep.name]) {
            return;
        }

        // Because shoving moves the creep, this will happen recursively
        blockingCreep.requestShove(this);
    }
}
Creep.prototype.requestShove = function(shover) {

    console.log(shover.name + " requesting shove on " + this.name);

    // Let's add this creep to the shove registry so it can't be shoved twice
    moveRegistry[this.name] = true;

    // Reusable utility method to ensure if a spot is walkable
    const terrain = Game.map.getRoomTerrain(this.room.name);
    function isObstructed(room, pos) {
        return terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL ||
               room.lookForAt(LOOK_STRUCTURES, pos).find(
                    (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER &&
                           (s.structureType !== STRUCTURE_RAMPART && s.my));
    }

    // Find all valid adjacent spaces
    const adjacentSpaces = [];
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            if (x === 0 && y === 0) {
                continue;
            }
            const newX = this.pos.x + x;
            const newY = this.pos.y + y;
            if (newX > 0 && newX < 49 && newY > 0 && newY < 49) {
                const newPos = new RoomPosition(newX, newY, this.pos.roomName);
                if (!isObstructed(this.room, newPos)) {
                    adjacentSpaces.push(newPos);
                }
            }
        }
    }

    // We can't move anywhere
    if (!adjacentSpaces.length) {
        return;
    }

    // If we don't have somewhere we want to be near, let's just move somewhere random
    const shoveTarget = this.memory._shoveTarget;
    if (!shoveTarget) {
        const chosenSpace = adjacentSpaces[Math.floor(Math.random() * adjacentSpaces.length)];
        this.move(this.pos.getDirectionTo(chosenSpace));
        return;
    }

    // Otherwise, let's make sure we're within range of our target
    const chosenSpace = adjacentSpaces.reduce((closest, curr) => {
        const currDist = curr.getRangeTo(shoveTarget.x, shoveTarget.y);
        const closestDist = closest.getRangeTo(shoveTarget.x, shoveTarget.y);
        return currDist < closestDist ? curr : closest;
    }, adjacentSpaces[0]);

    this.move(this.pos.getDirectionTo(chosenSpace));
}

function drawArrow(pos, direction) {
    const target = getPosInDirection(pos, direction);
    const x = target.x - ((target.x - pos.x) * 0.5);
    const y = target.y - ((target.y - pos.y) * 0.5);
    Game.rooms[pos.roomName].visual.line(pos.x, pos.y, x, y);
}

// Utility function
function getPosInDirection(startPos, direction) {
    const directions = {
        [TOP]:          [0, -1],
        [TOP_RIGHT]:    [1, -1],
        [RIGHT]:        [1,  0],
        [BOTTOM_RIGHT]: [1,  1],
        [BOTTOM]:       [0,  1],
        [BOTTOM_LEFT]:  [-1, 1],
        [LEFT]:         [-1, 0],
        [TOP_LEFT]:     [-1,-1],
    }
    return new RoomPosition(startPos.x + directions[direction][0], startPos.y + directions[direction][1], startPos.roomName);
}