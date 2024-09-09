const {
    ROAD_PATHING_COST,
    INTERRUPT_PATHING_COST,
    directionDelta,
    ROOM_SIZE,
} = require("./constants");
const utilEstimateTravelTime = require("./util.estimateTravelTime");

//#region Pathing

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

    options = utility.ensureDefaultOptions(options);
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
        const p = creep.pos;
        const onRoomEdge = p.x <= 0 || p.x >= 49 || p.y <= 0 || p.y >= 49;
        if (creep.pos.getRangeTo(target) <= options.range && !onRoomEdge) {
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
        if (creep.pos.getRangeTo(nextStep) > 1) {
            return newPath(creep);
        }

        // We're being blocked by a structure, or a slower creep
        const obstruction =
            nextStep
                .lookFor(LOOK_STRUCTURES)
                .concat(nextStep.lookFor(LOOK_CONSTRUCTION_SITES))
                .filter((o) =>
                    OBSTACLE_OBJECT_TYPES.includes(o.structureType)
                )[0] ||
            nextStep.lookFor(LOOK_CREEPS)[0] ||
            nextStep.lookFor(LOOK_SOURCES)[0];
        if (obstruction) {
            // Let's mark this as a working position for only this tick
            // so when we repath we try to go around
            markWorkingPosition(nextStep, Game.time);
            return newPath(creep);
        }

        return moveData.path;
    }

    const path = verifyPath(this);
    if (path.length) {
        const nextStep = utility.getNextStep(path, this.pos);

        // Handle relaying, if allowed
        if (options.allowRelaying && this.memory.relayTick !== Game.time) {
            // Only relay with creeps that have the same body and role
            const relayCreep = nextStep.lookFor(LOOK_CREEPS).find((c) => {
                if (!c.my) return false;
                if (c.memory.role !== this.memory.role) return false;
                if (c.memory.relayTick === Game.time) return false;
                // Can't relay with multiple resource types
                if (Object.keys(this.store) > 1 || Object.keys(c.store) > 1)
                    return false;
                const path = c.memory._move ? c.memory._move.path : null;
                // No point in relaying if we only need to travel 1 tile
                if (path && path.length === 1) return false;
                const sameBody =
                    c.getActiveBodyparts(CARRY) ===
                    this.getActiveBodyparts(CARRY);
                const validPath =
                    !path ||
                    path.length === 0 ||
                    utility.getNextStep(path, c.pos).isEqualTo(this.pos);
                return sameBody && validPath;
            });
            if (relayCreep) {
                console.log(this.pos + " relaying with " + relayCreep.pos);

                // Swap payload
                relayCreep.transfer(this, Object.keys(relayCreep.store)[0]);
                this.transfer(relayCreep, Object.keys(this.store)[0]);

                // Advance our path an extra step before swapping
                this.memory._move.path = utility.progressPath(
                    path,
                    relayCreep.pos
                );

                // Advance the other creep's path twice
                const otherMoveData = relayCreep.memory._move;
                if (
                    otherMoveData &&
                    otherMoveData.path &&
                    otherMoveData.length
                ) {
                    const newOtherPath = utility.progressPath(
                        otherMoveData.path,
                        relayCreep.pos
                    );
                    relayCreep.memory._move.path = utility.progressPath(
                        newOtherPath,
                        this.pos
                    );
                }

                // Record relay tick
                this.memory.relayTick = Game.time;
                relayCreep.memory.relayTick = Game.time;

                // Swap memory
                const swap = this.memory;
                this.memory = relayCreep.memory;
                relayCreep.memory = swap;

                // Handle full movement for both creeps
                if (otherMoveData.dest) {
                    this.betterMoveTo(otherMoveData.dest, options);
                }
                relayCreep.betterMoveTo(target, options);
                return;
            }
        }
        const direction = this.pos.getDirectionTo(nextStep);
        if (direction) {
            this.registerMove(direction);
        }
    }
    // Save our move data
    this.memory._move = {
        dest: target,
        path: path,
        range: options.range,
    };
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

    // Translate goals to pathfinder format
    const pathfinderGoals = goals.map((g) => {
        return { pos: g.pos || g, range: options.range };
    });
    const path = utility.getNewPath(this.pos, pathfinderGoals, options);

    // If we're already close enough to one of the goals, that's our goal
    for (const goal of goals) {
        if (
            utilEstimateTravelTime(this.pos, goal.pos || goal) <= options.range
        ) {
            return {
                goal: goal,
                path: [],
            };
        }
    }
    const lastPos = path[path.length - 1];
    const closestGoal = goals.find(
        // Here we're using estimate travel time since if our goal is just
        // on the other side of a border, we won't find a valid goal within range
        // despite the path ending inside the room we're currently in
        (g) => utilEstimateTravelTime(lastPos, g.pos || g) <= options.range
    );

    if (!closestGoal) {
        return;
    }

    return {
        goal: closestGoal,
        path: path,
    };
};
/**
 * Injects a path directly into the creep memory. Can be used with paths retrieved via
 * `betterFindClosestByPath`.
 * @param {RoomPosition[]} path The path to inject.
 * @param {RoomPosition} target The target the path is attempting to reach.
 */
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
        const direction = serializedPath[0];
        const delta = directionDelta[direction];
        const nextPos = {
            x: (lastPos.x + delta.x) % ROOM_SIZE,
            y: (lastPos.y + delta.y) % ROOM_SIZE,
        };
        const nextX = nextPos.x < 10 ? "0" + nextPos.x : nextPos.x.toString();
        const nextY = nextPos.y < 10 ? "0" + nextPos.y : nextPos.y.toString();
        const prefix = nextX + nextY;

        // return our new position and directions
        return prefix + serializedPath.substring(1);
    },

    getNewPath: function (startPos, goals, options) {
        const result = PathFinder.search(startPos, goals, {
            maxRooms: options.maxRooms,
            maxOps: options.maxOps,
            plainCost: options.plainCost,
            swampCost: options.swampCost,
            roomCallback: function (roomName) {
                const matrix = (
                    getCachedPathMatrix(options.pathSet, roomName) ||
                    generateDefaultPathMatrix(roomName)
                ).clone();

                // If we have working creeps this tick, let's mark
                // pathing over them with a penalty
                const terrain = Game.map.getRoomTerrain(roomName);
                for (const workingPos of cachedWorkingPositions) {
                    if (workingPos.tick !== Game.time) {
                        continue;
                    }
                    const pos = workingPos.pos;
                    if (pos.roomName !== roomName) {
                        continue;
                    }
                    matrix.set(
                        pos.x,
                        pos.y,
                        Math.max(
                            matrix.get(pos.x, pos.y),
                            (terrain.get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
                                ? options.swampCost
                                : options.plainCost) * INTERRUPT_PATHING_COST
                        )
                    );
                }
                return matrix;
            },
        });
        if (result.incomplete) {
            if (options.warnOnIncompletePath) {
                console.log(
                    `Couldn't find path from ${startPos} to goals: ${JSON.stringify(
                        goals
                    )}. Using incomplete path!`
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
            options.warnOnIncompletePath = DEBUG.warnOnIncompletePath;
        }
        if (options.allowRelaying === undefined) {
            options.allowRelaying = false;
        }
        return options;
    },
};

//#endregion

//#region Matrix Management

const cachedCostMatrices = {};
let cachedWorkingPositions = [];

/**
 * Caches a CostMatrix as part of a set to be used later.
 * @param {PathFinder.CostMatrix} matrix The CostMatrix to cache.
 * @param {string} setName The name of the set to cache to.
 * @param {string} roomName The name of the room that this matrix is for.
 */
const cachePathMatrix = (matrix, setName, roomName) => {
    if (!cachedCostMatrices[setName]) {
        cachedCostMatrices[setName] = {};
    }
    cachedCostMatrices[setName][roomName] = matrix;
};

/**
 * Retrieves a cached CostMatrix from the specified set for the specified room.
 * @param {string} setName The name of the set to retrieve from.
 * @param {string} roomName The name of the room that this matrix is for.
 * @returns {PathFinder.CostMatrix | undefined} The CostMatrix for the specified room as part of the specified set.
 * Undefined if none exists.
 */
const getCachedPathMatrix = (setName, roomName) => {
    if (!cachedCostMatrices[setName]) {
        return;
    }
    return cachedCostMatrices[setName][roomName];
};

const generateDefaultPathMatrix = (roomName) => {
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
            if (s.structureType === STRUCTURE_ROAD && s instanceof Structure) {
                // Disallow lowering the cost if another structure is already there
                matrix.set(
                    s.pos.x,
                    s.pos.y,
                    Math.max(matrix.get(s.pos.x, s.pos.y), ROAD_PATHING_COST)
                );
            } else if (s.structureType === STRUCTURE_CONTAINER) {
                return;
            } else if (s.structureType !== STRUCTURE_RAMPART || !s.my) {
                matrix.set(s.pos.x, s.pos.y, 255);
            }
        });

    return matrix;
};

const markWorkingPosition = (pos, tick = Game.time + 1) => {
    // Filter out old positions
    cachedWorkingPositions = cachedWorkingPositions.filter(
        (p) => p.tick >= Game.time
    );
    cachedWorkingPositions.push({ pos, tick });
};

const getWorkingPositions = (roomName) => {
    return cachedWorkingPositions.filter(
        (p) => p.tick === Game.time && p.pos.roomName === roomName
    );
};

//#endregion

// Here we can create new matrix sets from outside of this class and specify them as part of our move options
module.exports = {
    cachePathMatrix,
    getCachedPathMatrix,
    generateDefaultPathMatrix,
    markWorkingPosition,
    getWorkingPositions,
};
