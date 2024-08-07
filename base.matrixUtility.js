const { MAX_VALUE } = require("./base.planningConstants");
const { ROOM_SIZE } = require("./constants");

module.exports = {
    /**
     * Generates a cost matrix for this room, masking out all unwalkable terrain under max values.
     * @param {string} roomName The name of the room to generate the matrix for.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix with MAX_VALUE on all tiles containing unwalkable terrain.
     */
    generateTerrainMatrix: function (roomName) {
        const matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);
        this.iterateMatrix((x, y) => {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                matrix.set(x, y, MAX_VALUE);
            }
        });
        return matrix;
    },

    /**
     * Generates a cost matrix that represents the distance to the nearest terrain tile in this room.
     * @param {string} roomName The room to generate a matrix for.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix where the value of each tile represents to distance
     * to the nearest terrain tile.
     */
    generateDistanceTransform: function (roomName) {
        let matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);

        // Do a first pass, recording the location of all terrain for our floodfill
        const terrainPoints = [];
        this.iterateMatrix((x, y) => {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                terrainPoints.push({ x, y });
            }
        });
        matrix = this.floodfill(terrainPoints, matrix);

        // Do another pass, this time setting all terrain to 0
        this.iterateMatrix((x, y) => {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                matrix.set(x, y, 0);
            }
        });
        return matrix;
    },

    /**
     * Generates a cost matrix that marks all tiles within 1 tile of an exit as MAX_VALUE.
     * @param {Room} room The room to create the matrix for.
     * @returns {PathFinder.CostMatrix} A newly created cost matrix with MAX_VALUE on all tiles within 1 of an exit.
     */
    generateExitMatrix: function (room) {
        const exitMatrix = new PathFinder.CostMatrix();
        const exits = room.find(FIND_EXIT);
        for (const exit of exits) {
            const neighbours = [];
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const newX = exit.x + x;
                    const newY = exit.y + y;
                    if (
                        newX < 0 ||
                        newX > 49 ||
                        newY < 0 ||
                        newY > 49 ||
                        exitMatrix.get(newX, newY) > 0
                    ) {
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
    generateNeighbourMatrix: function (pos, range) {
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
     * @returns {PathFinder.CostMatrix} A new costmatrix where each value represents
     * the distance to the nearest start tile.
     */
    floodfill: function (fromPositions, matrix) {
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
                    if (
                        scoredPositions[newX * ROOM_SIZE + newY] ||
                        matrix.get(newX, newY) === MAX_VALUE
                    ) {
                        continue;
                    }

                    // Mark this next tile as scored
                    scoredPositions[newX * ROOM_SIZE + newY] = true;
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
    addScoreMatrices: function (...matrixWeightPairs) {
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
        this.iterateMatrix((x, y) => {
            // Find the sum of all matrix weights in this location, excluding max values
            // since they are not scaled
            const total = matrixWeightPairs.reduce((total, pair) => {
                if (pair.matrix.get(x, y) === MAX_VALUE) {
                    return total;
                }
                return total + pair.matrix.get(x, y) * pair.weight;
            }, 0);
            largest = Math.max(total, largest);
            smallest = Math.min(total, smallest);
        });
        const scale = largest - smallest;

        // Now we have our scale for normalization and we can create our actual matrix,
        // normalizing our individual values to keep them within our range as we go
        const matrix = new PathFinder.CostMatrix();
        this.iterateMatrix((x, y) => {
            const total = matrixWeightPairs.reduce((total, pair) => {
                // If one matrix uses the max value, we should use max value everywhere for this tile
                if (pair.matrix.get(x, y) === MAX_VALUE) {
                    return Infinity;
                }
                return total + pair.matrix.get(x, y) * pair.weight;
            }, 0);
            const normalizedValue =
                scale === 0
                    ? 0
                    : Math.round(
                          ((total - smallest) / scale) * (MAX_VALUE - 1)
                      );
            matrix.set(x, y, normalizedValue);
        });
        return matrix;
    },

    /**
     * Takes the highest weight of all matrices for each tile and combines them into a single matrix.
     * @param  {...PathFinder.CostMatrix} matrices Any number of cost matrices to consider.
     */
    combineMatrices: function (...matrices) {
        const newMatrix = new PathFinder.CostMatrix();
        this.iterateMatrix((x, y) => {
            const highest = matrices.reduce((highest, curr) => {
                return curr.get(x, y) > highest ? curr.get(x, y) : highest;
            }, 0);
            newMatrix.set(x, y, highest);
        });
        return newMatrix;
    },

    /**
     * Normalizes a cost matrix so that its minimum value becomes zero, and its max value becomes `normalizeScale`.
     * @param {PathFinder.CostMatrix} matrix The matrix to normalize.
     * @param {number} normalizeScale The max value allowed in the new normalized matrix.
     * @returns {PathFinder.CostMatrix} A new cost matrix with the normalized values of the input cost matrix.
     */
    normalizeMatrix: function (matrix, normalizeScale) {
        // Find our scale
        let minValue = MAX_VALUE;
        let maxValue = 0;
        this.iterateMatrix((x, y) => {
            const value = matrix.get(x, y);
            if (value === MAX_VALUE) {
                return;
            }
            minValue = Math.min(minValue, value);
            maxValue = Math.max(maxValue, value);
        });
        const scale = maxValue - minValue;

        // Normalize each score based on its magnitude inside of our range
        const newMatrix = new PathFinder.CostMatrix();
        this.iterateMatrix((x, y) => {
            const oldValue = matrix.get(x, y);
            if (oldValue === MAX_VALUE) {
                return;
            }
            const newValue =
                scale === 0
                    ? 0
                    : Math.round(
                          ((oldValue - minValue) / scale) * normalizeScale
                      );
            newMatrix.set(x, y, newValue);
        });
        return newMatrix;
    },

    /**
     * Iterates over the positions in a cost matrix, performing a callback for each tile.
     * @param {(x: number, y: number) => void} callbackFn
     */
    iterateMatrix: function (callbackFn) {
        for (let x = 0; x < ROOM_SIZE; x++) {
            for (let y = 0; y < ROOM_SIZE; y++) {
                callbackFn(x, y);
            }
        }
    },

    /**
     * Counts the occurences of the given value in the given matrix.
     * @param {PathFinder.CostMatrix} matrix The matrix to count occurences in.
     * @param {number} value The value to look for.
     * @returns {number} The number of occurences of value found.
     */
    countOccurences: function (matrix, value) {
        let total = 0;
        this.iterateMatrix((x, y) => {
            if (matrix.get(x, y) === value) {
                total++;
            }
        });
        return total;
    },
};
