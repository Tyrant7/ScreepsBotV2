const overlay = require("./overlay");

const MAX_VALUE = 255;

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_CONTROLLER_SPACE = 0.6;
const WEIGHT_MINERAL = 0.15;
const WEIGHT_SOURCES = 0.9;
const WEIGHT_SOURCES_SPACE = 0.25;
const WEIGHT_EXIT_DIST = -0.65;
const WEIGHT_TERRAIN_DIST = -1;

const CHECK_MAXIMUM = 90;

const FILLER_COUNT = 2;
const LAB_COUNT = 1;

const EXTENSIONS_PER_FILLER = 12;

const MAX_STRUCTURES = {};
for (const key in CONTROLLER_STRUCTURES) {
    MAX_STRUCTURES[key] = parseInt(Object.values(CONTROLLER_STRUCTURES[key]).slice(-1));
}

class BasePlanner {
    run(roomInfo) {
        if (Game.cpu.bucket <= 200) {
            console.log("bucket is empty");
            return;
        }

        if (!this.roomPlan) {
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

            this.roomPlan = new PathFinder.CostMatrix();
            const cpu = Game.cpu.getUsed();

            // Generate our necessary matrices for planning
            const terrainMatrix = matrixUtility.generateTerrainMatrix(roomInfo.room.name);
            const distanceTransform = matrixUtility.generateDistanceTransform(roomInfo.room.name);
            const weightMatrix = this.generateWeightMatrix(roomInfo, terrainMatrix, distanceTransform);

            // Let's sort all spaces by score
            let spaces = [];
            for (let x = 2; x < 48; x++) {
                for (let y = 2; y < 48; y++) {
                    spaces.push({ x, y });
                }
            }
            spaces.sort((a, b) => weightMatrix.get(a.x, a.y) - weightMatrix.get(b.x, b.y));

            // Now let's check each space in order until we find one that fits our core
            let corePos;
            for (const space of spaces) {
                let bestStampData;
                for (const transform of stampUtility.getTransformationList()) {
                    const transformedStamp = transform(stamps.core);
                    if (stampUtility.stampFits(transformedStamp, space, distanceTransform, this.roomPlan)) {

                        // Score the stamp
                        let score = 0;
                        for (let y = 0; y < transformedStamp.layout.length; y++) {
                            for (let x = 0; x < transformedStamp.layout[y].length; x++) {
                                const actualX = space.x - transformedStamp.center.x + x;
                                const actualY = space.y - transformedStamp.center.y + y;
                                score += weightMatrix.get(actualX, actualY);
                            }
                        }

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
                if (bestStampData) {
                    this.roomPlan = stampUtility.placeStamp(bestStampData.stamp, bestStampData.pos, this.roomPlan);
                    corePos = space;
                    break;
                }
            }

            // Once we have our core, let's plan out our artery roads
            // This will also handle container placement
            const roadPoints = roomInfo.sources
                .concat(roomInfo.room.controller)
                .concat(roomInfo.mineral);
            const roadMatrix = this.planRoads(roadPoints, roomInfo.room.name, corePos, this.roomPlan);
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

            // Next, we'll connect up any roads we've placed that aren't currently connected
            const stragglingRoadConnectors = this.connectStragglingRoads(roomInfo.room.name, corePos, this.roomPlan);
            this.roomPlan = matrixUtility.combineMatrices(this.roomPlan, stragglingRoadConnectors);

            // Filter out spaces we've already used
            spaces = spaces.filter((space) => this.roomPlan.get(space.x, space.y) === 0);

            // Next, we'll place our remaining extensions, we'll plan extra for tower placement positions later
            const remainingExtensions = MAX_STRUCTURES[STRUCTURE_EXTENSION] 
                - (FILLER_COUNT * EXTENSIONS_PER_FILLER)
                + MAX_STRUCTURES[STRUCTURE_TOWER];
            // Here we'll be marking the extensions we place to use as potential tower locations later
            const extensionPositions = [];
            for (let i = 0; i < remainingExtensions; i++) {
                // Find the lowest scoring tile that is also adjacent to a road
                let bestSpot;
                for (const space of spaces) {
                    if (terrainMatrix.get(space.x, space.y) > 0 || this.roomPlan.get(space.x, space.y) > 0) {
                        continue;
                    }

                    let hasRoad = false;
                    for (let x = -1; x <= 1; x++) {
                        for (let y = -1; y <= 1; y++) {
                            const newX = space.x + x;
                            const newY = space.y + y;
                            if (this.roomPlan.get(newX, newY) === structureToNumber[STRUCTURE_ROAD]) {
                                hasRoad = true;
                                break;
                            }
                        }
                        if (hasRoad) {
                            break;
                        }
                    }

                    if (hasRoad) {
                        bestSpot = space;
                        break;
                    }
                }

                if (!bestSpot) {
                    console.log("Could not fit all extensions!")
                    break;
                }
                this.roomPlan.set(bestSpot.x, bestSpot.y, structureToNumber[STRUCTURE_EXTENSION]);
                extensionPositions.push({ x: bestSpot.x, y: bestSpot.y });
            }

            // Next, we'll replace the extra extensions we placed above with towers

            // Start by creating floodfills for each exit
            const exitMatrices = [];
            for (const exitKey in Game.map.describeExits(roomInfo.room.name)) {
                const matrix = matrixUtility.floodfill(roomInfo.room.find(exitKey), terrainMatrix.clone());
                exitMatrices.push(matrix);
            }
            
            // Then we'll circle through each exit and optimize a tower for that exit
            for (let i = 0; i < MAX_STRUCTURES[STRUCTURE_TOWER]; i++) {

                // Find the position of the planned extension with the lowest distance to the exit we've select
                const activeMatrix = exitMatrices[i % exitMatrices.length];
                const nextTowerPos = extensionPositions.reduce((best, curr) => {
                    return activeMatrix.get(curr.x, curr.y) < activeMatrix.get(best.x, best.y) 
                        ? curr 
                        : best;
                });
                this.roomPlan.set(nextTowerPos.x, nextTowerPos.y, structureToNumber[STRUCTURE_TOWER]);

                // Remove this position so we don't try to place a tower there again
                extensionPositions.splice(extensionPositions.indexOf(nextTowerPos), 1);
            }

            console.log("planned base in " + (Game.cpu.getUsed() - cpu) + " cpu!");
        }

        overlay.visualizeBasePlan(roomInfo.room.name, this.roomPlan, structureToNumber);
    }

    generateWeightMatrix(roomInfo, terrainMatrix, distanceTransform) {
        const controllerMatrix = {
            matrix: matrixUtility.floodfill(roomInfo.room.controller.pos, terrainMatrix.clone()),
            weight: WEIGHT_CONTROLLER,
        };

        // Discourage building too close to controller
        const controllerFreeSpace = {
            matrix: matrixUtility.generateNeighbourMatrix(roomInfo.room.controller.pos, 2),
            weight: WEIGHT_CONTROLLER_SPACE,
        };

        const mineralMatrix = {
            matrix: matrixUtility.floodfill(roomInfo.mineral.pos, terrainMatrix.clone()),
            weight: WEIGHT_MINERAL,
        };
        const sourceMatrices = [];
        for (const source of roomInfo.sources) {
            sourceMatrices.push({
                matrix: matrixUtility.floodfill(source.pos, terrainMatrix.clone()),
                weight: WEIGHT_SOURCES,
            });

            // Discourage building too close to a source
            sourceMatrices.push({
                matrix: matrixUtility.generateNeighbourMatrix(source.pos, 2),
                weight: WEIGHT_SOURCES_SPACE,
            });
        }
        const exitMask = {
            matrix: matrixUtility.generateExitMatrix(roomInfo.room),
            weight: 0,
        };
        const exitDistMatrix = {
            matrix: matrixUtility.floodfill(roomInfo.room.find(FIND_EXIT), terrainMatrix.clone()),
            weight: WEIGHT_EXIT_DIST,
        };

        const distMatrix = {
            matrix: distanceTransform,
            weight: WEIGHT_TERRAIN_DIST,
        };

        return matrixUtility.normalizeMatrix(
            matrixUtility.addScoreMatrices(controllerMatrix, 
                controllerFreeSpace, 
                mineralMatrix, 
                ...sourceMatrices, 
                exitMask, 
                exitDistMatrix,
                distMatrix),
            MAX_VALUE - 1,
        );
    }

    planRoads(connectPoints, roomName, corePos, roomPlan) {

        // Path from further points first
        connectPoints.sort((a, b) => b.pos.getRangeTo(corePos.x, corePos.y) - a.pos.getRangeTo(corePos.x, corePos.y));

        // Save a path to each of our road points
        // Use a separate matrix for road positions and pathing locations
        const roadMatrix = new PathFinder.CostMatrix();
        const pathfindMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = roomPlan.get(x, y);
                pathfindMatrix.set(x, y, 
                    value === structureToNumber[STRUCTURE_ROAD] 
                        ? 1 
                        : value === 0 
                        ? 0 
                        : 255
                );
            }
        }
        corePos = new RoomPosition(corePos.x, corePos.y, roomName);
        for (const point of connectPoints) {
            const goal = { pos: point.pos, range: 1 };
            const result = PathFinder.search(
                corePos, goal, {
                    plainCost: 2,
                    swampCost: 2,
                    maxRooms: 1,
                    roomCallback: function(roomName) {
                        return pathfindMatrix;
                    },
                },
            );

            // Save these into our road matrix
            for (const step of result.path) {
                pathfindMatrix.set(step.x, step.y, 1);
                roadMatrix.set(step.x, step.y, structureToNumber[STRUCTURE_ROAD]);
            }

            if (point instanceof Source || point instanceof Mineral) {
                const lastStep = result.path.slice(-1)[0];
                roadMatrix.set(lastStep.x, lastStep.y, structureToNumber[STRUCTURE_CONTAINER]);
            }
        }
        return roadMatrix;
    }

    connectStragglingRoads(roomName, corePos, roomPlan) {

        // First, construct an array of all of our roads
        let allRoads = [];
        const roadMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (roomPlan.get(x, y) === structureToNumber[STRUCTURE_ROAD]) {
                    allRoads.push({ x, y });
                    roadMatrix.set(x, y, 1);
                    continue;
                }
                roadMatrix.set(x, y, 255);
            }
        }

        // Then, identify any roads that cannot connect back to the core
        const stragglingRoads = [];
        const maxNeededTiles = allRoads.length;
        const goal = { pos: new RoomPosition(corePos.x, corePos.y, roomName), range: 1 };
        while (allRoads.length) {
            const next = allRoads.pop();
            const result = PathFinder.search(
                new RoomPosition(next.x, next.y, roomName), goal, {
                    maxRooms: 1,
                    maxCost: maxNeededTiles,
                    roomCallback: function(roomName) {
                        return roadMatrix;
                    },
                },
            );

            // For each road we stepped over, remembering to include our start position
            for (const road of result.path.concat(next)) {
                // We can remove this road from our array since we know its state now
                allRoads = allRoads.filter((r) => r.x !== road.x || r.y !== road.y);

                // If it was incomplete, we know that this road
                // does not connect back to our core
                if (result.incomplete) {
                    stragglingRoads.push(road);
                }
            }
        }

        // Plan roads to connect these back to our core
        const roadPositions = stragglingRoads.map((r) => {
            return { pos: new RoomPosition(r.x, r.y, roomName) };
        });
        return this.planRoads(roadPositions, roomName, corePos, roomPlan);
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
     * Generates a cost matrix that marks all tiles within 1 tile of an exit as MAX_VALUE.
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
     * Generates a cost matrix that marks all tiles within range of the target as 1.
     * @param {{ x: number, y: number }} pos The position to mark the neighbours of.
     * @param {number} range The max range of tiles from the position to mark.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix.
     */
    generateNeighbourMatrix: function(pos, range) {
        const neighbourMatrix = new PathFinder.CostMatrix();
        for (let x = -range; x <= range; x++) {
            for (let y = -range; y <= range; y++) {
                const newX = pos.x + x;
                const newY = pos.y + y;
                if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
                    continue;
                }
                neighbourMatrix.set(newX, newY, 1);
            }
        }
        return neighbourMatrix;
    },

    /**
     * Performs a floodfill from an array of starting positions, 
     * and takes into account a predefined terrain matrix.
     * @param {RoomPosition | RoomPosition[]} fromPositions The positions to fill from.
     * @param {PathFinder.CostMatrix} matrix The predefined matrix to fill around.
     * @param {number} depthLimit The fill will stop after reaching this depth.
     * @returns {PathFinder.CostMatrix} A new costmatrix where each value represents
     * the distance to the nearest start tile.
     */
    floodfill: function(fromPositions, matrix, depthLimit = Infinity) {
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
                if (fillDepth > depthLimit) {
                    break;
                }
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
            [undefined, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, undefined],
            [STRUCTURE_ROAD, STRUCTURE_STORAGE, STRUCTURE_OBSERVER, STRUCTURE_SPAWN, STRUCTURE_ROAD],
            [STRUCTURE_ROAD, STRUCTURE_TERMINAL, undefined, STRUCTURE_FACTORY, STRUCTURE_ROAD],
            [STRUCTURE_ROAD, STRUCTURE_POWER_SPAWN, STRUCTURE_NUKER, STRUCTURE_LINK, STRUCTURE_ROAD],
            [undefined, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, undefined],
        ],
        // Points used for validating distances around this stamp to ensure 
        // no overlap with each other or terrain
        // Relative to the top left corner
        distancePoints: [
            { x: 2, y: 2, range: 2 },
        ],
        // The center for placement
        // The stamp will be attempted to place with this tile on the lowest scoring weight
        center: { x: 2, y: 1 },
    },

    fastFiller: {
        layout: [
            [undefined, STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION],
            [STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_SPAWN, undefined, STRUCTURE_EXTENSION],
            [STRUCTURE_EXTENSION, undefined, STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION],
            [STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD, undefined],
        ],
        distancePoints: [
            { x: 3, y: 1, range: 1 },
            { x: 2, y: 1, range: 1 },
            { x: 2, y: 2, range: 1 },
            { x: 1, y: 2, range: 1 },
        ],
        center: { x: 2, y: 1 },
    },

    labs: {
        layout: [
            [undefined, STRUCTURE_LAB, STRUCTURE_LAB, undefined],
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