const overlay = require("./overlay");

const MAX_VALUE = 255;

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_MINERAL = 0.15;
const WEIGHT_SOURCES = 0.9;
const WEIGHT_EXIT_DIST = -0.5;

const CHECK_MAXIMUM = 90;

const FILLER_COUNT = 2;
const LAB_COUNT = 1;

class BasePlanner {
    run(roomInfo) {
        if (!this.roomPlan) {
            this.roomPlan = new PathFinder.CostMatrix();
            const cpu = Game.cpu.getUsed();

            // Generate our necessary matrices for planning
            const terrainMatrix = matrixUtility.generateTerrainMatrix(roomInfo.room.name);
            const weightMatrix = this.generateWeightMatrix(roomInfo, terrainMatrix);
            const distanceTransform = matrixUtility.generateDistanceTransform(roomInfo.room.name);

            // Let's sort all spaces by score
            let spaces = [];
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                    spaces.push({ x, y });
                }
            }
            spaces.sort((a, b) => weightMatrix.get(a.x, a.y) - weightMatrix.get(b.x, b.y));

            // Now let's check each space in order until we find one that fits our core
            let corePos;
            for (const space of spaces) {
                if (stampUtility.stampFits(stamps.core, space, distanceTransform, this.roomPlan)) {
                    this.roomPlan = stampUtility.placeStamp(stamps.core, space, this.roomPlan);
                    corePos = space;
                    break;
                }
            }

            // Once we have our core, let's plan out our artery roads
            const roadMatrix = this.planRoads(roomInfo, corePos, this.roomPlan);
            this.roomPlan = matrixUtility.combineMatrices(this.roomPlan, roadMatrix);

            // Filter out spaces we've already used
            spaces = spaces.filter((space) => this.roomPlan.get(space.x, space.y) === 0);

            // Then, we'll plan our our fast-filler locations
            this.roomPlan = placeStamps(stamps.fastFiller, FILLER_COUNT, this.roomPlan, (stamp, pos) => {
                let totalScore = 0;
                for (let y = 0; y < stamp.layout.length; y++) {
                    for (let x = 0; x < stamp.layout[y].length; x++) {
                        const actualX = pos.x - stamp.center.x + x;
                        const actualY = pos.y - stamp.center.y + y;
                        totalScore += weightMatrix.get(actualX, actualY);
                    }
                }
                return totalScore;
            });

            // Filter out spaces we've already used
            spaces = spaces.filter((space) => this.roomPlan.get(space.x, space.y) === 0);

            // And labs
            this.roomPlan = placeStamps(stamps.labs, LAB_COUNT, this.roomPlan, (stamp, pos) => {
                let totalScore = 0;
                for (let y = 0; y < stamp.layout.length; y++) {
                    for (let x = 0; x < stamp.layout[y].length; x++) {
                        const actualX = pos.x - stamp.center.x + x;
                        const actualY = pos.y - stamp.center.y + y;
                        totalScore += weightMatrix.get(actualX, actualY);
                    }
                }
                return totalScore;
            });

            console.log("planned base in " + (Game.cpu.getUsed() - cpu) + " cpu!");

            function placeStamps(stamp, count, roomPlan, scoreFn) {
                for (let i = 0; i < count; i++) {
    
                    // Find the best stamp we can place currently
                    // Only consider the best suspected locations
                    let bestStampData;
                    let checkedLocations = 0;
                    for (const space of spaces) {
                        if (checkedLocations >= CHECK_MAXIMUM && bestStampData) {
                            break;
                        }
                        checkedLocations++;
    
                        // Consider all orientations
                        for (const transform of stampUtility.getTransformationList()) {
                            const transformedStamp = transform(stamp);
                            if (stampUtility.stampFits(transformedStamp, space, distanceTransform, roomPlan)) {

                                // Score the stamp
                                let score = scoreFn(transformedStamp, space);

                                // Lower scores are better
                                if (!bestStampData || score < bestStampData.score) {
                                    bestStampData = {
                                        stamp: transformedStamp,
                                        score: score,
                                        pos: space,
                                    };
                                }
                            }
                        }
                    }
    
                    // Once we've found the current best stamp, let's place it
                    if (bestStampData) {
                        roomPlan = stampUtility.placeStamp(bestStampData.stamp, bestStampData.pos, roomPlan);
                    }
                }
                return roomPlan;
            }
        }

        overlay.visualizeCostMatrix(roomInfo.room.name, this.roomPlan);
    }

    generateWeightMatrix(roomInfo, terrainMatrix) {
        const controllerMatrix = {
            matrix: matrixUtility.floodfill(roomInfo.room.controller.pos, terrainMatrix.clone()),
            weight: WEIGHT_CONTROLLER,
        };

        const mineralMatrix = {
            matrix: matrixUtility.floodfill(roomInfo.mineral.pos, terrainMatrix.clone()),
            weight: WEIGHT_MINERAL,
        };
        const sourceMatrices = [];
        for (const source of roomInfo.sources) {
            sourceMatrices.push(
                {
                    matrix: matrixUtility.floodfill(source.pos, terrainMatrix.clone()),
                    weight: WEIGHT_SOURCES,
                }
            );
        }
        const exitMask = {
            matrix: matrixUtility.generateExitMatrix(roomInfo.room),
            weight: 0,
        };
        const exitDistMatrix = {
            matrix: matrixUtility.floodfill(roomInfo.room.find(FIND_EXIT), terrainMatrix.clone()),
            weight: WEIGHT_EXIT_DIST,
        };

        return matrixUtility.normalizeMatrix(
            matrixUtility.addScoreMatrices(controllerMatrix, mineralMatrix, ...sourceMatrices, exitMask, exitDistMatrix),
            MAX_VALUE - 1,
        );
    }

    planRoads(roomInfo, corePos, roomPlan) {
        const roadPoints = roomInfo.sources
            .concat(roomInfo.room.controller)
            .concat(roomInfo.mineral);
        
        // Save a path to each of our road points
        const terrain = roomInfo.room.getTerrain();
        const roadMatrix = new PathFinder.CostMatrix();
        for (const point of roadPoints) {
            const goal = { pos: point.pos, range: 2 };
            const result = PathFinder.search(
                new RoomPosition(corePos.x, corePos.y, roomInfo.room.name), goal, {
                    plainCost: 2,
                    swampCost: 2,
                    maxRooms: 1,
                    roomCallback: function(roomName) {

                        // Combine our road matrix and unwalkable matrices
                        const newMatrix = new PathFinder.CostMatrix();
                        for (let x = 0; x < 50; x++) {
                            for (let y = 0; y < 50; y++) {
                                const unwalkable = (roomPlan.get(x, y) > 0 ? 255 : 0);
                                newMatrix.set(x, y, roadMatrix.get(x, y) + unwalkable);
                            }
                        }
                        return newMatrix;
                    },
                },
            );

            // Save these into our road matrix
            for (const step of result.path) {
                roadMatrix.set(step.x, step.y, 1);
            }
        }
        return roadMatrix;
    }
}

const matrixUtility = {
    /**
     * Generates a cost matrix for this room, masking out all unwalkable terrain under max values. 
     * @param {string} roomName The name of the room to generate the matrix for.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix with MAX_VALUE on all tiles containing unwalkable terrain.
     */
    generateTerrainMatrix: function(roomName) {
        const matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, MAX_VALUE);
                }
            }
        }
        return matrix;
    },

    /**
     * Generates a cost matrix that represents the distance to the nearest terrain tile in this room.
     * @param {string} roomName The room to generate a matrix for.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix where the value of each tile represents to distance
     * to the nearest terrain tile.
     */
    generateDistanceTransform: function(roomName) {
        let matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);

        // Do a first pass, recording the location of all terrain for our floodfill
        const terrainPoints = [];
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    terrainPoints.push({ x, y });
                }
            }
        }
        matrix = this.floodfill(terrainPoints, matrix);

        // Do another pass, this time setting all terrain to 0
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 0);
                }
            }
        }
        return matrix;
    },

    /**
     * Generates a cost matrix that marks all tiles within 1 tile of an exit as unwalkable.
     * @param {Room} room The room to create the matrix for.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix with MAX_VALUE on all tiles within 1 of an exit.
     */
    generateExitMatrix: function(room) {
        const exitMatrix = new PathFinder.CostMatrix();
        const exits = room.find(FIND_EXIT);
        for (const exit of exits) {
            const neighbours = [];
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const newX = exit.x + x;
                    const newY = exit.y + y;
                    if (newX < 0 || newX > 49 || newY < 0 || newY > 49 ||
                        exitMatrix.get(newX, newY) > 0) {
                        continue;
                    }
                    neighbours.push({ x: newX, y: newY });
                }
            }
            for (const neighbour of neighbours) {
                exitMatrix.set(neighbour.x, neighbour.y, MAX_VALUE);
            }
        }
        return exitMatrix;
    },

    /**
     * Performs a floodfill from an array of starting positions, 
     * and takes into account a predefined terrain matrix.
     * @param {RoomPosition | RoomPosition[]} fromPositions The positions to fill from.
     * @param {PathFinder.CostMatrix} matrix The predefined matrix to fill around.
     * @returns {PathFinder.CostMatrix} A new costmatrix where each value represents
     * the distance to the nearest start tile.
     */
    floodfill: function(fromPositions, matrix) {
        if (!(fromPositions instanceof Array)) {
            fromPositions = [fromPositions];
        }

        const scoredPositions = {};
        let fillDepth = 0;
        let fillQueue = fromPositions;
        let nextQueue = [];
        while (fillQueue.length > 0) {
            const next = fillQueue.shift();

            // Score this tile based on our current depth
            matrix.set(next.x, next.y, fillDepth);

            // Add all unscored neighbours
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const newX = next.x + x;
                    const newY = next.y + y;
                    if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
                        continue;
                    }

                    // We're already marked this tile to be scored, or it's unwalkable and we should skip it
                    if (scoredPositions[(newX + 1) * 50 + newY] || matrix.get(newX, newY) === MAX_VALUE) {
                        continue;
                    }

                    // Mark this next tile as scored
                    scoredPositions[(newX + 1) * 50 + newY] = true;
                    nextQueue.push({ x: newX, y: newY });
                }
            }

            if (fillQueue.length === 0) {
                fillQueue = nextQueue;
                nextQueue = [];
                fillDepth++;
            }
        }
        return matrix;
    },

    /**
     * Adds up all matrices, respecting their weights and keeping their final range within the 0-255 range.
     * @param  {...{ matrix: PathFinder.CostMatrix, weight: number }} matrixWeightPairs Any number of matrix-and-weight objects.
     * @returns {PathFinder.CostMatrix} A newly created costmatrix, representing the sum of the weighted values of all matrices. 
     */
    addScoreMatrices: function(...matrixWeightPairs) {

        // First, normalize each matrix
        matrixWeightPairs.map((pair) => {
            return {
                weight: pair.weight,
                matrix: this.normalizeMatrix(pair.matrix, MAX_VALUE - 1),
            };
        });

        // Here we'll do a soft run of our matrix creation and track our largest 
        // and smallest values for normalization
        let largest = 0;
        let smallest = MAX_VALUE;
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                // Find the sum of all matrix weights in this location, excluding max values
                // since they are not scaled
                const total = matrixWeightPairs.reduce((total, pair) => {
                    if (pair.matrix.get(x, y) === MAX_VALUE) {
                        return total;
                    }
                    return total + (pair.matrix.get(x, y) * pair.weight);
                }, 0);
                largest = Math.max(total, largest);
                smallest = Math.min(total, smallest);
            }
        }
        const scale = largest - smallest;

        // Now we have our scale for normalization and we can create our actual matrix,
        // normalizing our individual values to keep them within our range as we go
        const matrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const total = matrixWeightPairs.reduce((total, pair) => {
                    // If one matrix uses the max value, we should use max value everywhere for this tile
                    if (pair.matrix.get(x, y) === MAX_VALUE) {
                        return Infinity;
                    }
                    return total + (pair.matrix.get(x, y) * pair.weight);
                }, 0);
                const normalizedValue = scale === 0 
                    ? 0
                    : Math.round(((total - smallest) / scale) * (MAX_VALUE - 1));
                matrix.set(x, y, normalizedValue);
            }
        }
        return matrix;
    },

    /**
     * Takes the highest weight of all matrices for each tile and combines them into a single matrix.
     * @param  {...PathFinder.CostMatrix} matrices Any number of cost matrices to consider.
     */
    combineMatrices: function(...matrices) {
        const newMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const highest = matrices.reduce((highest, curr) => {
                    return curr.get(x, y) > highest ? curr.get(x, y) : highest;
                }, 0);
                newMatrix.set(x, y, highest);
            }
        }
        return newMatrix;
    },

    /**
     * Normalizes a cost matrix so that its minimum value becomes zero, and its max value becomes `normalizeScale`.
     * @param {PathFinder.CostMatrix} matrix The matrix to normalize.
     * @param {number} normalizeScale The max value allowed in the new normalized matrix.
     * @returns {PathFinder.CostMatrix} The normalized cost matrix.
     */
    normalizeMatrix: function(matrix, normalizeScale) {

        // Find our scale
        let minValue = MAX_VALUE;
        let maxValue = 0;
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = matrix.get(x, y);
                if (value === MAX_VALUE) {
                    continue;
                }
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        }
        const scale = maxValue - minValue;

        // Normalize each score based on its magnitude inside of our range
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const oldValue = matrix.get(x, y);
                if (oldValue === MAX_VALUE) {
                    continue;
                }
                const newValue = scale === 0 
                    ? 0
                    : Math.round(((oldValue - minValue) / scale) * normalizeScale);
                matrix.set(x, y, newValue);
            }
        }
        return matrix;
    },
};

const structureToNumber = {
    [STRUCTURE_SPAWN]:        10,
    [STRUCTURE_EXTENSION]:    5,
    [STRUCTURE_ROAD]:         1,
    [STRUCTURE_RAMPART]:      100,
    [STRUCTURE_LINK]:         20,
    [STRUCTURE_STORAGE]:      99,
    [STRUCTURE_TOWER]:        4,
    [STRUCTURE_OBSERVER]:     71,
    [STRUCTURE_POWER_SPAWN]:  61,
    [STRUCTURE_EXTRACTOR]:    51,
    [STRUCTURE_LAB]:          6,
    [STRUCTURE_TERMINAL]:     81,
    [STRUCTURE_CONTAINER]:    3,
    [STRUCTURE_NUKER]:        91,
    [STRUCTURE_FACTORY]:      41,
};

const stamps = {
    core: {
        layout: [
            [STRUCTURE_POWER_SPAWN, STRUCTURE_OBSERVER, STRUCTURE_SPAWN],
            [STRUCTURE_TERMINAL, undefined, STRUCTURE_FACTORY],
            [STRUCTURE_STORAGE, STRUCTURE_NUKER, STRUCTURE_LINK],
        ],
        // Points used for validating distances around this stamp to ensure 
        // no overlap with each other or terrain
        // Relative to the top left corner
        distancePoints: [
            { x: 1, y: 1, range: 1 },
        ],
        // The center for placement
        // The stamp will be attempted to place with this tile on the lowest scoring weight
        center: { x: 2, y: 0 },
    },

    fastFiller: {
        layout: [
            [undefined, STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION],
            [STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_SPAWN, undefined, STRUCTURE_EXTENSION],
            [STRUCTURE_EXTENSION, undefined, STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION],
            [STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, undefined, undefined],
        ],
        distancePoints: [
            { x: 3, y: 1, range: 1 },
            { x: 2, y: 1, range: 1 },
            { x: 1, y: 2, range: 1 },
        ],
        center: { x: 2, y: 1 },
    },

    labs: {
        layout: [
            [undefined, STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD],
            [STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB],
            [STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB],
            [undefined, STRUCTURE_LAB, STRUCTURE_LAB, undefined],
        ],
        distancePoints: [
            { x: 2, y: 1, range: 1 },
            { x: 1, y: 2, range: 1 },
        ],
        center: { x: 3, y: 0 },
    },
};

const stampUtility = {
    stampFits: function(stamp, pos, distanceTransform, existingPlans) {
        for (const point of stamp.distancePoints) {
            const newX = pos.x + point.x - stamp.center.x;
            const newY = pos.y + point.y - stamp.center.y;
            if (distanceTransform.get(newX, newY) <= point.range) {
                return false;
            }

            // Look at all points within range of this one to ensure nothing else is placed there
            for (let x = -point.range; x <= point.range; x++) {
                for (let y = -point.range; y <= point.range; y++) {
                    if (existingPlans.get(newX + x, newY + y) > 0) {
                        return;
                    }
                }
            }
        }
        return true;
    },

    placeStamp: function(stamp, pos, planMatrix) {
        for (let y = 0; y < stamp.layout.length; y++) {
            for (let x = 0; x < stamp.layout[y].length; x++) {
                const structureValue = structureToNumber[stamp.layout[y][x]];
                if (structureValue) {
                    planMatrix.set(pos.x - stamp.center.x + x, pos.y - stamp.center.y + y, structureValue);
                }
            }
        }
        /*
        // Debug
        for (const point of stamp.distancePoints) {
            planMatrix.set(pos.x + point.x - stamp.center.x, pos.y + point.y - stamp.center.y, 254);
        }
        */
        return planMatrix;
    },

    mirrorStamp: function(stamp) {
        // Deep copy our stamp to ensure the original remains unmodified
        stamp = JSON.parse(JSON.stringify(stamp));
        const dimensions = { x: stamp.layout[0].length, y: stamp.layout.length };
        stamp.layout.reverse();
        for (const p of stamp.distancePoints) {
            p.y = dimensions.y - 1 - p.y;
        }
        stamp.center.y = dimensions.y - 1 - stamp.center.y;
        return stamp;
    },

    rotateStamp: function(stamp) {
        stamp = JSON.parse(JSON.stringify(stamp));
        const dimensions = { x: stamp.layout[0].length, y: stamp.layout.length };
        stamp.layout = _.zip(...stamp.layout);
        for (const p of stamp.distancePoints) {
            const temp = p.x;
            p.x = p.y;
            p.y = temp;
        }

        const temp = stamp.center.y;
        stamp.center.y = stamp.center.x;
        stamp.center.x = temp;
        return stamp;
    },

    getTransformationList: function() {
        return [
            (stamp) => stamp,
            (stamp) => this.mirrorStamp(stamp),
            (stamp) => this.rotateStamp(stamp),
            (stamp) => this.mirrorStamp(this.rotateStamp(stamp)),
            (stamp) => this.rotateStamp(this.mirrorStamp(stamp)),
            (stamp) => this.rotateStamp(this.mirrorStamp(this.rotateStamp(stamp))),
            (stamp) => this.mirrorStamp(this.rotateStamp(this.mirrorStamp(stamp))),
            (stamp) => this.rotateStamp(this.mirrorStamp(this.rotateStamp(this.mirrorStamp(stamp)))),
        ];
    },
};

module.exports = BasePlanner;