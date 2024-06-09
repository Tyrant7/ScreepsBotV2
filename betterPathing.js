const profiler = require("./profiler");

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
Creep.prototype.betterMoveTo = function (target, options = {}) {
    // Don't try to move while still spawning
    if (this.spawning) {
        return;
    }

    if (!(target instanceof RoomPosition)) {
        target = target.pos;
        if (!target) {
            throw new Error(
                "Invalid move target: " +
                    target +
                    " does not contain a 'pos' property"
            );
        }
    }

    // Reset the move registry if not yet this tick
    if (registryTick !== Game.time) {
        moveRegistry = {};
        registryTick = Game.time;
    }

    options = utility.ensureDefaultOptions(options);

    // Save our shove target in case we get shoved
    profiler.startSample(this.name + " moveTo");
    function newPath(creep) {
        // If we use a custom matrix set, it's safe to assume we know where we're pathing
        const endPathIfNoVisibility = !options.pathSet;
        return utility.serializePath(
            utility.getNewPath(
                creep.pos,
                { pos: target, range: options.range },
                options
            ),
            endPathIfNoVisibility
        );
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
        if (
            target.getRangeTo(moveData.dest.x, moveData.dest.y) >
                options.range ||
            target.roomName !== moveData.dest.roomName
        ) {
            return newPath(creep);
        }

        // If we moved last time, we should be right on our path
        const nextStep = utility.getNextStep(moveData.path, creep.pos);
        if (creep.pos.isEqualTo(nextStep)) {
            return utility.progressPath(moveData.path, creep.pos);
        }

        // Something went wrong with our pathing
        const obstruction = nextStep
            .look(LOOK_STRUCTURES)
            .concat(nextStep.look(LOOK_CONSTRUCTION_SITES))
            .filter((o) => OBSTACLE_OBJECT_TYPES[o.structureType]);
        if (creep.pos.getRangeTo(nextStep) > 1 || obstruction) {
            return newPath(creep);
        }

        return moveData.path;
    }

    // Don't try to move until we've spawned
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
    this.memory._move = {
        dest: target,
        path: path,
        range: options.range,
    };
    profiler.endSample(this.name + " moveTo");
};
Creep.prototype.wrappedMove = Creep.prototype.move;
Creep.prototype.move = function (direction) {
    // Record ourselves in the move registry
    moveRegistry[this.name] = true;

    // Do our ordinary move
    const intentResult = this.wrappedMove(direction);
    if (intentResult === OK) {
        // If there's a creep standing where we want to go, let's request a shove
        this.shoveIfNecessary(utility.getPosInDirection(this.pos, direction));
    }
};
Creep.prototype.shoveIfNecessary = function (targetPos) {
    if (!targetPos) {
        return;
    }

    const blockingCreep = this.room
        .lookForAt(LOOK_CREEPS, targetPos.x, targetPos.y)
        .find((c) => c.my);
    if (blockingCreep) {
        // Let's make sure that this creep hasn't scheduled a move already
        if (registryTick === Game.time && moveRegistry[blockingCreep.name]) {
            return;
        }

        // Because shoving moves the creep, this will happen recursively
        blockingCreep.requestShove();
    }
};
Creep.prototype.requestShove = function () {
    // Reusable utility method to ensure if a spot is walkable
    const terrain = Game.map.getRoomTerrain(this.room.name);
    function isObstructed(room, pos) {
        // Terrain block
        return (
            terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL ||
            // Unwalkable structure + construction sites
            room
                .lookForAt(LOOK_STRUCTURES, pos)
                .concat(room.lookForAt(LOOK_CONSTRUCTION_SITES, pos))
                .find(
                    (s) =>
                        s.structureType !== STRUCTURE_ROAD &&
                        s.structureType !== STRUCTURE_CONTAINER &&
                        s.structureType !== STRUCTURE_RAMPART &&
                        s.my
                )
        );
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

    const shoveTarget = this.memory._move;
    const scoredSpaces = adjacentSpaces.map((space) => {
        const otherCreep = space.lookFor(LOOK_CREEPS)[0];
        return {
            // Discourage moving to spaces with creeps
            score:
                (otherCreep ? (moveRegistry[otherCreep.name] ? 3 : 1) : 0) +
                // If we have a target, let's move towards them, but limit the range to a minimum our movement range
                // since we don't necessarily want to be pushed directly into our target most of the time
                // If we don't have a target, let's assign a random weight to this position
                (shoveTarget
                    ? Math.max(
                          space.getRangeTo(
                              shoveTarget.dest.x,
                              shoveTarget.dest.y
                          ),
                          shoveTarget.range,
                          1
                      ) * 2
                    : Math.random()),

            pos: space,
        };
    });

    // Find our lowest scoring space (measured by distance to target)
    const chosenSpace = scoredSpaces.reduce((lowest, curr) => {
        return curr.score < lowest.score ? curr : lowest;
    }).pos;

    drawArrow(this.pos, this.pos.getDirectionTo(chosenSpace), {
        color: "#FF0000",
    });
    this.move(this.pos.getDirectionTo(chosenSpace));
};
/**
 * Finds the closest goal to this creep.
 * @param {RoomPosition[] | {pos: RoomPosition}[]} goals A an array of RoomPositions or any objects with a pos property.
 * @param {{}} options Pathfinding options.
 * @returns {{closestGoal: any, path: RoomPosition[]} | undefined} An object containing the chosen goal, as well as a path.
 * Undefined if no complete path could be found.
 */
Creep.prototype.betterFindClosestByPath = function (goals, options = {}) {
    // Find a path to the closest goal
    options = utility.ensureDefaultOptions(options);
    options.warnOnIncompletePath = true;
    const path = utility.getNewPath(this.pos, goals, options);

    // If we have no path, then use our own position
    const lastPos = path.slice(-1)[0] || this.pos;
    const closestGoal = lastPos.findInRange(goals, 1)[0];
    if (!closestGoal) {
        return;
    }

    return {
        goal: closestGoal,
        path: path,
    };
};
Creep.prototype.injectPath = function (path, target) {
    this.memory._move = {
        dest: target,
        path: utility.serializePath(path),
    };
};
Creep.prototype.hasShorterPath = function (path) {
    if (path instanceof Array) {
        path = utility.serializePath(path);
    }
    return this.memory._move && this.memory._move.path.length <= path.length;
};
Creep.prototype.getPathLength = function () {
    return this.memory._move && this.memory._move.path
        ? // We subtract 3 here because the next step of the path is always saved as
          // 4 characters representing the X and Y room positions
          this.memory._move.path.length - 3
        : 0;
};

// Debug
function drawArrow(pos, direction, style) {
    if (!DEBUG.drawOverlay || !DEBUG.drawTrafficArrows) {
        return;
    }
    const target = utility.getPosInDirection(pos, direction);
    if (!target) {
        return;
    }
    const x = target.x - (target.x - pos.x) * 0.5;
    const y = target.y - (target.y - pos.y) * 0.5;
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
    serializePath: function (path, endPathIfNoVisibility = false) {
        let serializedPath = "";
        if (!path[0]) {
            return serializedPath;
        }

        // Serialize our starting position
        serializedPath +=
            path[0].x < 10 ? "0" + path[0].x : path[0].x.toString();
        serializedPath +=
            path[0].y < 10 ? "0" + path[0].y : path[0].y.toString();

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
    getNextStep: function (serializedPath, currentPos) {
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
    progressPath: function (serializedPath, currentPos) {
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
    getPosInDirection: function (startPos, direction) {
        const directions = {
            [TOP]: [0, -1],
            [TOP_RIGHT]: [1, -1],
            [RIGHT]: [1, 0],
            [BOTTOM_RIGHT]: [1, 1],
            [BOTTOM]: [0, 1],
            [BOTTOM_LEFT]: [-1, 1],
            [LEFT]: [-1, 0],
            [TOP_LEFT]: [-1, -1],
        };
        const newX = (startPos.x + directions[direction][0]) % 50;
        const newY = (startPos.y + directions[direction][1]) % 50;
        return { x: newX, y: newY };
    },

    getNewPath: function (startPos, goals, options) {
        const MAX_ATTEMPTS = 2;
        let attempts = 1;
        let result;
        while (attempts <= MAX_ATTEMPTS) {
            result = PathFinder.search(startPos, goals, {
                maxRooms: options.maxRooms * attempts,
                maxOps: options.maxOps * attempts,
                plainCost: options.plainCost,
                swampCost: options.swampCost,
                roomCallback: function (roomName) {
                    if (options.pathSet) {
                        const matrix = matrixHandler.getCachedMatrix(
                            options.pathSet,
                            roomName
                        );
                        if (matrix) {
                            return matrix;
                        }
                    }
                    return matrixHandler.generateDefaultCostMatrix(roomName);
                },
            });
            if (!result.incomplete) {
                break;
            }
            // Raise maxOps and try again
            attempts++;
        }
        if (result.incomplete) {
            if (options.warnOnIncompletePath) {
                console.log(
                    "Couldn't find path from " +
                        startPos +
                        " to goals: " +
                        JSON.stringify(goals)
                );
            }
        }
        return result.path;
    },

    ensureDefaultOptions: function (options) {
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
        if (options.warnOnIncompletePath === undefined) {
            options.warnOnIncompletePath = false;
        }
        return options;
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
    cacheMatrix: function (matrix, setName, roomName) {
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
    getCachedMatrix: function (setName, roomName) {
        if (!cachedCostMatrices[setName]) {
            return;
        }
        return cachedCostMatrices[setName][roomName];
    },

    generateDefaultCostMatrix: function (roomName) {
        const matrix = new PathFinder.CostMatrix();
        const room = Game.rooms[roomName];
        if (!room) {
            return matrix;
        }

        // Simply avoid unwalkable structures + construction sites
        room.find(FIND_STRUCTURES)
            .concat(room.find(FIND_CONSTRUCTION_SITES))
            .forEach((s) => {
                // Don't count road sites as roads
                if (
                    s.structureType === STRUCTURE_ROAD &&
                    s instanceof Structure
                ) {
                    matrix.set(s.pos.x, s.pos.y, 1);
                } else if (
                    s.structureType !== STRUCTURE_CONTAINER &&
                    (s.structureType !== STRUCTURE_RAMPART || !s.my)
                ) {
                    matrix.set(s.pos.x, s.pos.y, 255);
                }
            });
        return matrix;
    },
};

//#endregion

// Here we can create new matrix sets from outside of this class and specify them as part of our move options
module.exports = matrixHandler;
