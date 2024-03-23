const profiler = require("profiler");

let moveRegistry = {};
let registryTick = -1;

Creep.prototype.moveTo = function(target, options = {}) {
    if (!(target instanceof RoomPosition)) {
        target = target.pos;
        if (!target) {
            throw new Error("Invalid move target: " + target + " does not contain a 'pos' property");
        }
    }

    // Reset the move registry if not yet this tick
    if (registryTick !== Game.time) {
        moveRegistry = {};
        registryTick = Game.time;
    }

    // Make sure we include these options
    // Must explicitly check undefined since 0 will evaluate to false
    if (options.range === undefined) {
        options.range = 1;
    }
    if (!options.maxRooms === undefined) {
        options.maxRooms = 4;
    }

    // Save our shove target in case we get shoved
    profiler.startSample(this.name + " moveTo");
    this.betterMoveTo(target, options);
    profiler.endSample(this.name + " moveTo");
}
Creep.prototype.betterMoveTo = function(target, options) {

    function getNewPath(startPos, goals) {
        const result = PathFinder.search(
            startPos, goals, {
                maxRooms: options.maxRooms,
                plainCost: 2,
                swampCost: 10,
                roomCallback: getCachedCostMatrix,
            }
        );
        return result.path;
    }

    function verifyPath(creep) {

        // Don't path until we've spawned
        if (creep.spawning) {
            return [];
        }

        // Don't need to move
        if (creep.pos.getRangeTo(target) <= options.range) {
            return [];
        }

        // If we don't have valid move data, let's repath
        const moveData = creep.memory._move;
        if (!moveData || !moveData.path || !moveData.path.length || moveData.room !== creep.room.name) {
            return getNewPath(creep.pos, { pos: target, range: options.range });
        }

        // Make sure our path ends within range of our target
        const path = moveData.path;
        const lastNode = path.slice(-1);
        if (target.getRangeTo(lastNode.x, lastNode.y) <= options.range ||
            target.roomName !== moveData.dest.roomName) {
            return getNewPath(creep.pos, { pos: target, range: options.range });
        }

        // If we moved last time, we should be right on our path
        const nextStep = new RoomPosition(path[0].x, path[0].y, path[0].roomName);
        if (creep.pos.isEqualTo(nextStep)) {
            return moveData.path.slice(1);
        }

        // Something went wrong with our pathing
        if (creep.pos.getRangeTo(nextStep) > 1) {
            return getNewPath(creep.pos, { pos: target, range: options.range });
        }

        return moveData.path;
    }

    const path = verifyPath(this);
    if (path.length) {
        const nextStep = new RoomPosition(path[0].x, path[0].y, path[0].roomName);
        const direction = this.pos.getDirectionTo(nextStep); 
        drawArrow(this.pos, direction, { color: "#00FF00" });
        this.move(direction);
    }

    // Save our move data
    this.memory._shoveTarget = target;
    if (!this.memory._move) {
        this.memory._move = {};
    }
    this.memory._move.dest = target;
    this.memory._move.path = path;
    this.memory._move.room = this.room.name;
}
Creep.prototype.wrappedMove = Creep.prototype.move;
Creep.prototype.move = function(direction) {

    // Record ourselves in the move registry
    moveRegistry[this.name] = true;

    // Do our ordinary move
    this.wrappedMove(direction);

    // If there's a creep standing where we want to go, let's request a shove
    this.shoveIfNecessary(getPosInDirection(this.pos, direction));
}
Creep.prototype.shoveIfNecessary = function(targetPos) {
    if (!targetPos) {
        return;
    }

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
        // Terrain block
        return terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL ||
        // Unwalkable structure
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

    // Let's make sure we resort to spaces with other creeps last
    adjacentSpaces.sort((a, b) => {
        return a.lookFor(LOOK_CREEPS)[0] ? 1 : 0;
    });

    // Big ugly code block :)
    const shoveTarget = this.memory._shoveTarget;
    const chosenSpace = shoveTarget 
        // Let's make sure we're within range of our target
        ? adjacentSpaces.reduce((closest, curr) => {
            // Limit the range to a minimum of 1 since we don't necessarily want to be pushed
            // Direction into our target most of the time
            const currDist = Math.max(curr.getRangeTo(shoveTarget.x, shoveTarget.y), 1);
            const closestDist = Math.max(closest.getRangeTo(shoveTarget.x, shoveTarget.y), 1);
            return currDist < closestDist ? curr : closest;
        }, adjacentSpaces[0])
        // If we don't have somewhere we want to be near, let's just move somewhere random
        : adjacentSpaces[Math.floor(Math.random() * adjacentSpaces.length)];
     
    drawArrow(this.pos, this.pos.getDirectionTo(chosenSpace), { color: "#FF0000" });
    this.move(this.pos.getDirectionTo(chosenSpace));
}

// Debug
function drawArrow(pos, direction, style) {
    if (!DEBUG.drawOverlay || !DEBUG.drawTrafficArrows) {
        return;
    }
    const target = getPosInDirection(pos, direction);
    if (!target) {
        return;
    }
    const x = target.x - ((target.x - pos.x) * 0.5);
    const y = target.y - ((target.y - pos.y) * 0.5);
    Game.rooms[pos.roomName].visual.line(pos.x, pos.y, x, y, style);
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
    const newX = startPos.x + directions[direction][0];
    const newY = startPos.y + directions[direction][1];
    if (newX > 0 && newX < 49 && newY > 0 && newY < 49) {
        return new RoomPosition(newX, newY, startPos.roomName);
    }
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