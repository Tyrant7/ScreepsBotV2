const utility = require("betterPathingUtility");
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
        const maxOps = 2000;
        const MAX_ATTEMPTS = 2;
        let result;
        for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
            result = PathFinder.search(
                startPos, goals, {
                    maxRooms: options.maxRooms,
                    maxOps: maxOps * attempts,
                    plainCost: 2,
                    swampCost: 10,
                    roomCallback: getCachedCostMatrix,
                }
            );
            if (result.incomplete) {            
                // Raise maxOps and try again
                continue;
            }
            return utility.serializePath(result.path);
        }
        // console.log("No path could be found from " + startPos + " to " + goals.pos + " with range " + goals.range + ". Using incomplete path!");
        return utility.serializePath(result.path);
    }

    function verifyPath(creep) {

        // Don't need to move
        if (creep.pos.getRangeTo(target) <= options.range) {
            return [];
        }

        // If we don't have valid move data, let's repath
        const moveData = creep.memory._move;
        if (!moveData || !moveData.path || !moveData.path.length) {
            return getNewPath(creep.pos, { pos: target, range: options.range });
        }

        // Make sure our destination is still within range of our target
        if (target.getRangeTo(moveData.dest.x, moveData.dest.y) > options.range ||
            target.roomName !== moveData.dest.roomName) {
            return getNewPath(creep.pos, { pos: target, range: options.range });
        }

        // If we moved last time, we should be right on our path
        const nextStep = utility.getNextStep(moveData.path, creep.pos);
        if (creep.pos.isEqualTo(nextStep)) {
            return utility.progressPath(moveData.path, creep.pos);
        }

        // Something went wrong with our pathing
        if (creep.pos.getRangeTo(nextStep) > 1) {
            return getNewPath(creep.pos, { pos: target, range: options.range });
        }

        return moveData.path;
    }

    // Don't try to move until we've spawned
    if (this.spawning) {
        return;
    }

    const path = verifyPath(this);
    if (path.length) {
        const nextStep = utility.getNextStep(path, this.pos);
        const direction = this.pos.getDirectionTo(nextStep); 
        if (direction) {
            drawArrow(this.pos, direction, { color: "#00FF00" });
            this.move(direction);
        }
    }

    // Save our move data
    this.memory._shoveTarget = target;
    if (!this.memory._move) {
        this.memory._move = {};
    }
    this.memory._move.dest = target;
    this.memory._move.path = path;
}
Creep.prototype.wrappedMove = Creep.prototype.move;
Creep.prototype.move = function(direction) {

    // Record ourselves in the move registry
    moveRegistry[this.name] = true;

    // Do our ordinary move
    this.wrappedMove(direction);

    // If there's a creep standing where we want to go, let's request a shove
    this.shoveIfNecessary(utility.getPosInDirection(this.pos, direction));
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
        blockingCreep.requestShove();
    }
}
Creep.prototype.requestShove = function() {

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
    const target = utility.getPosInDirection(pos, direction);
    if (!target) {
        return;
    }
    const x = target.x - ((target.x - pos.x) * 0.5);
    const y = target.y - ((target.y - pos.y) * 0.5);
    Game.rooms[pos.roomName].visual.line(pos.x, pos.y, x, y, style);
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
