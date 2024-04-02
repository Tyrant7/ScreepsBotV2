const profiler = require("profiler");

//#region Pathing

let moveRegistry = {};
let registryTick = -1;

/**
 * A better implementation of the engine's default moveTo method.
 * @param {RoomPosition | RoomObject} target A RoomPosition or any object with a room position.
 * @param {{}} options A huge object with parameters about the move. Supports most parameters of default moveTo, plus a few additional:
 * pathSet: string -> use a custom set of cost matrices for pathfinding, defined below the cacheMatrix() method. 
 * By default, costmatrices are generated to only include terrain and unwalkable spaces for unwalkable structures.
 */
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
    if (options.maxRooms === undefined) {
        options.maxRooms = 6;
    }
    if (options.plainCost === undefined) {
        options.plainCost = 2;
    }
    if (options.swampCost === undefined) {
        options.swampCost = 10;
    }
    if (options.maxOps === undefined) {
        options.maxOps = 2000;
    }

    // Save our shove target in case we get shoved
    profiler.startSample(this.name + " moveTo");
    this.betterMoveTo(target, options);
    profiler.endSample(this.name + " moveTo");
}
Creep.prototype.betterMoveTo = function(target, options) {

    function newPath(creep) {
        return utility.getNewPath(creep.pos, { pos: target, range: options.range }, options);
    }

    function verifyPath(creep) {

        // Don't need to move
        if (creep.pos.getRangeTo(target) <= options.range) {
            return [];
        }

        // If we don't have valid move data, let's repath
        const moveData = creep.memory._move;
        if (!moveData || !moveData.path || !moveData.path.length) {
            return newPath(creep);
        }

        // Make sure our destination is still within range of our target
        if (target.getRangeTo(moveData.dest.x, moveData.dest.y) > options.range ||
            target.roomName !== moveData.dest.roomName) {
            return newPath(creep);
        }

        // If we moved last time, we should be right on our path
        const nextStep = utility.getNextStep(moveData.path, creep.pos);
        if (creep.pos.isEqualTo(nextStep)) {
            return utility.progressPath(moveData.path, creep.pos);
        }

        // Something went wrong with our pathing
        if (creep.pos.getRangeTo(nextStep) > 1) {
            return newPath(creep);
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

//#endregion

//#region Utility

const utility = {
    /**
     * Serializes a path as a starting position and array of directions into a single string.
     * @param {RoomPosition[]} path The path to serialize.
     * @param {boolean} endPathIfNoVisibility A flag telling us to end the path once we enter a new room with no visibility.
     * Disable this setting if we're using a cached path. If we're pathing normally we'll usually want this enabled to prevent us
     * from accidentally pathing into unwalkable built structures that we had no vision on when we started pathing.
     * @returns {string} The path in serialized form.
     */
    serializePath: function(path, endPathIfNoVisibility = false) {
        let serializedPath = "";
        if (!path[0]) {
            return serializedPath;
        }

        // Serialize our starting position
        serializedPath += path[0].x < 10 ? "0" + path[0].x : path[0].x.toString();
        serializedPath += path[0].y < 10 ? "0" + path[0].y : path[0].y.toString();

        // Create an array of directions to follow from here
        let lastPos = path[0];
        for (const pos of path) {
            if (pos === lastPos) {
                continue;
            }
            serializedPath += lastPos.getDirectionTo(pos);
            lastPos = pos;
            if (endPathIfNoVisibility && !Game.rooms[pos.roomName]) {
                break;
            }
        }
        return serializedPath;
    },
        
    /**
     * Gets the next step in the path. 
     * @param {string} serializedPath The serialized path to step through.
     * @param {RoomPosition} currentPos The position of the creep following the path. Used for determining the next room. 
     * @returns {RoomPosition} The next position to move to in the path.
     */
    getNextStep: function(serializedPath, currentPos) {
        const nextX = parseInt(serializedPath.substring(0, 2));
        const nextY = parseInt(serializedPath.substring(2, 4));
        return new RoomPosition(nextX, nextY, currentPos.roomName);
    },
        
    /**
     * Advances the path by one step, and returns it.
     * @param {string} serializedPath The path to advance.
     * @param {RoomPosition} currentPos The position of the creep following the path. Used for determining the next room. 
     * @returns {string} The serialized path, progressed one step.
     */
    progressPath: function(serializedPath, currentPos) {
        // First identify our next position
        const lastPos = this.getNextStep(serializedPath, currentPos);

        // Then cut our next step out of our path
        serializedPath = serializedPath.substring(4);
        if (!serializedPath.length) {
            return "";
        }

        // Finally, append our next position to our path
        const nextPos = this.getPosInDirection(lastPos, serializedPath[0]);
        const nextX = nextPos.x < 10 ? "0" + nextPos.x : nextPos.x.toString();
        const nextY = nextPos.y < 10 ? "0" + nextPos.y : nextPos.y.toString();
        const prefix = nextX + nextY;

        // return our new position and directions
        return prefix + serializedPath.substring(1);
    },

    /**
     * Gets the position in the given direction, excluding roomName.
     * @param {RoomPosition} startPos The starting position.
     * @param {DirectionConstant} direction The direction to go in.
     * @returns {{x: number, y: number}} An object with X and Y positions from 0 to 49.
     */
    getPosInDirection: function(startPos, direction) {
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
        const newX = (startPos.x + directions[direction][0]) % 50;
        const newY = (startPos.y + directions[direction][1]) % 50;
        return { x: newX, y: newY };
    },

    getNewPath: function(startPos, goals, options) {
        const MAX_ATTEMPTS = 2;
        let attempts = 1;
        // If we use a custom matrix set, it's safe to assume we know where we're pathing
        let endPathIfNoVisibility = !options.pathSet;
        let result;
        while (attempts <= MAX_ATTEMPTS) {
            result = PathFinder.search(
                startPos, goals, {
                    maxRooms: options.maxRooms,
                    maxOps: options.maxOps * attempts,
                    plainCost: options.plainCost,
                    swampCost: options.swampCost,
                    roomCallback: function(roomName) {
                        if (options.pathSet) {
                            const matrix = matrixHandler.getCachedMatrix(options.pathSet, roomName);
                            if (matrix) {
                                return matrix;
                            }
                        }
                        return matrixHandler.generateDefaultCostMatrix(roomName);
                    },
                },
            );
            if (!result.incomplete) {
                break;
            }
            // Raise maxOps and try again
            attempts++;
        }
        return this.serializePath(result.path, endPathIfNoVisibility);
    },
};

//#endregion

//#region Matrix Management

const cachedCostMatrices = {};
const matrixHandler = {
    
    /**
     * Caches a CostMatrix as part of a set to be used later.
     * @param {PathFinder.CostMatrix} matrix The CostMatrix to cache.
     * @param {string} setName The name of the set to cache to.
     * @param {string} roomName The name of the room that this matrix is for.
     */
    cacheMatrix: function(matrix, setName, roomName) {
        if (!cachedCostMatrices[setName]) {
            cachedCostMatrices[setName] = {};
        }
        cachedCostMatrices[setName][roomName] = matrix;
    },

    /**
     * Retrieves a cached CostMatrix from the specified set for the specified room.
     * @param {string} setName The name of the set to retrieve from.
     * @param {string} roomName The name of the room that this matrix is for.
     * @returns {PathFinder.CostMatrix | undefined} The CostMatrix for the specified room as part of the specified set.
     * Undefined if none exists.
     */
    getCachedMatrix: function(setName, roomName) {
        if (!cachedCostMatrices[setName]) {
            return;
        }
        return cachedCostMatrices[setName][roomName];
    },

    generateDefaultCostMatrix: function(roomName) {
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
        return matrix;
    },
};

//#endregion

// Here we can create new matrix sets from outside of this class and specify them as part of our move options
module.exports = matrixHandler;