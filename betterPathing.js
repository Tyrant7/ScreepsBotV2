const profiler = require("profiler");

let moveRegistry = {};
let registryTick = -1;

Creep.prototype.moveTo = function(target, options = {}) {
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

    // Make sure we include these options
    if (!options.range) {
        options.range = 1;
    }
    if (!options.maxRooms) {
        options.maxRooms = 6;
    }

    // Save our shove target in case we get shoved
    profiler.startSample(this.name + " moveTo");
    this.memory._shoveTarget = target;
    this.betterMoveTo(target, options);
    profiler.endSample(this.name + " moveTo");
}
Creep.prototype.betterMoveTo = function(target, options) {

    function serializePath(startPos, path) {

        // First 4 characters are coordinates of the next step
        let serialized = "";
        serialized += path[0].x < 10 ? "0" + path[0].x : path[0].x;
        serialized += path[0].y < 10 ? "0" + path[0].y : path[0].y;

        // Now append directions for the remainer of the path until we hit a different room
        let previous = startPos;
        for (const point of path) {
            if (point.x < 0 || point.x > 49 || point.y < 0 || point.y > 49) {
                break;
            }
            const next = new RoomPosition(point.x, point.y, startPos.roomName);
            serialized += previous.getDirectionTo(next);
            previous = next;
        }
        return serialized;
    }

    function deserializePath(serializedPath) {
        return Room.deserializePath(serializedPath);
    }

    function getNewPath(startPos, goals, maxRooms = options.maxRooms) {
        const result = PathFinder.search(
            startPos, goals, {
                maxRooms: maxRooms,
                plainCost: 2,
                swampCost: 10,
                roomCallback: getCachedCostMatrix,
            }
        );
        return serializePath(startPos, result.path);
    }

    function verifyPath(creep) {

        // For testing
        if (false) {
            const newPath = getNewPath(creep.pos, { pos: target, range: options.range });
            return {
                dest: target,
                path: newPath,
                room: creep.room.name,
            };
        }

        // Make sure we have valid move data for the room we're in
        const moveData = creep.memory._move;
        if (!moveData || creep.room.name !== moveData.room) {
            const newPath = getNewPath(creep.pos, { pos: target, range: options.range });
            return {
                dest: target,
                path: newPath,
                room: creep.room.name,
            };
        }

        // Make sure our path ends within range of our target
        const path = deserializePath(moveData.path);
        const lastNode = path.slice(-1);
        if (target.getRangeTo(lastNode.x, lastNode.y) <= options.range ||
            target.roomName !== moveData.dest.roomName) {
            const newPath = getNewPath(creep.pos, { pos: target, range: options.range });
            return {
                dest: target,
                path: newPath,
                room: creep.room.name,
            };
        }

        // If we've been shoved, it's possible we'll be out of range of our next path point
        // If that occurs, let's push a short correction pathing to any point in our path
        if (creep.pos.getRangeTo(path[0]) > 1) {
            
            console.log(creep.name + " path correction");

            // Let's make sure we're only trying to correct using points that are in this room
            const goals = [];
            let lastX = creep.pos.x;
            let lastY = creep.pos.y;
            for (const point in path) {
                lastX += point.dx;
                lastY += point.dy;
                if (lastX <= 0 || lastX >= 49 || lastY <= 0 || lastY >= 49) {
                    break;
                }
                goals.push({
                    pos: new RoomPosition(lastX, lastY, creep.roomName),
                    range: 0,
                });
            }
            const pathCorrection = deserializePath(getNewPath(creep.pos, goals, 1));
            return {
                dest: target,
                path: pathCorrection.concat(path),
                room: creep.room.name,
            };
        }        

        // Valid
        return moveData;
    }

    // We don't need to move at all
    if (this.pos.getRangeTo(target) <= options.range) {
        return;
    }

    const moveData = verifyPath(this);

    // console.log(this.name + " path: " + moveData.path);

    const path = deserializePath(moveData.path);
    let nextStep = path[0];

    // We must have moved last tick since we're standing at the first spot in our path, 
    // let's serialize our path again
    if (nextStep.x === this.pos.x && nextStep.y === this.pos.y) {
        path.shift();
        if (!path.length) {
            return;
        }
        moveData.path = serializePath(this.pos, path);
        nextStep = path[0];
    }

    this.move(nextStep.direction);
    this.memory._move = moveData;
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

// Debug
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

let cachedCostMatrices = {};

function getCachedCostMatrix(roomName) {
    if (cachedCostMatrices[roomName] && cachedCostMatrices[roomName].tick === Game.time) {
        return cachedCostMatrices[roomName].costs;
    }

    const matrix = new PathFinder.CostMatrix();

    const room = Game.rooms[roomName];
    if (!room) {
        return matrix;
    }

    // Simply avoid unwalkable structures
    room.find(FIND_STRUCTURES).forEach((s) => {
        if (s.structureType === STRUCTURE_ROAD) {
            matrix.set(s.pos.x, s.pos.y, 1);
        }
        else if (s.structureType !== STRUCTURE_CONTAINER &&
                (s.structureType !== STRUCTURE_RAMPART || !s.my)) {
            matrix.set(s.pos.x, s.pos.y, 255);
        }
    });

    cachedCostMatrices[roomName] = { tick: Game.time, costs: matrix };
    return matrix;
}