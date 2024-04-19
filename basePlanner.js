const overlay = require("./overlay");

const MAX_VALUE = 255;

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_MINERAL = 0.15;
const WEIGHT_SOURCES = 0.88;
const WEIGHT_EXIT_DIST = -0.5;

class BasePlanner {
    run(roomInfo) {
        
        if (!this.flood) {
            const terrainMatrix = planningUtility.generateTerrainMatrix(roomInfo.room.name);

            const controllerMatrix = {
                matrix: planningUtility.floodfill(roomInfo.room.controller.pos, terrainMatrix.clone()),
                weight: WEIGHT_CONTROLLER,
            };
            const mineralMatrix = {
                matrix: planningUtility.floodfill(roomInfo.mineral.pos, terrainMatrix.clone()),
                weight: WEIGHT_MINERAL,
            };
            const sourceMatrices = [];
            for (const source of roomInfo.sources) {
                sourceMatrices.push(
                    {
                        matrix: planningUtility.floodfill(source.pos, terrainMatrix.clone()),
                        weight: WEIGHT_SOURCES,
                    }
                );
            }
            const exitMask = {
                matrix: this.getExitMask(roomInfo),
                weight: 0,
            };
            const exitDistMatrix = {
                matrix: planningUtility.floodfill(roomInfo.room.find(FIND_EXIT), terrainMatrix.clone()),
                weight: WEIGHT_EXIT_DIST,
            };

            const newMat = planningUtility.addMatrices(controllerMatrix, mineralMatrix, ...sourceMatrices, exitMask, exitDistMatrix);

            this.flood = planningUtility.normalizeMatrix(newMat, MAX_VALUE-1);
        }

        overlay.visualizeCostMatrix(roomInfo.room.name, this.flood);
    }

    getExitMask(roomInfo) {
        const exitMatrix = new PathFinder.CostMatrix();
        const exits = roomInfo.room.find(FIND_EXIT);
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
    }
}

const planningUtility = {
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

        function getMinNeighbourScore(posX, posY) {
            let minScore = MAX_VALUE;
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    // Ensure valid position
                    const newX = posX + x;
                    const newY = posY + y;
                    if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
                        continue;
                    }

                    // If this is one of our starting tiles, let's return zero
                    if (fromPositions.find((pos) => newX === pos.x && newY === pos.y)) {
                        return 0;
                    }

                    // Don't include unscored tiles
                    const score = matrix.get(newX, newY);
                    if (score === 0) {
                        continue;
                    }
                    minScore = Math.min(score, minScore);
                }
            }
            return minScore;
        }

        const fillQueue = fromPositions.map((pos) => {
            return {
                x: pos.x,
                y: pos.y,
            };
        });
        while (fillQueue.length > 0) {
            const next = fillQueue.shift();

            // Score the current tile according to the min of its neighbours + 1
            const minNeighbourScore = getMinNeighbourScore(next.x, next.y);
            matrix.set(next.x, next.y, minNeighbourScore + 1);

            // Add all unscored neighbours
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const newX = next.x + x;
                    const newY = next.y + y;
                    if (newX < 0 || newX > 49 || newY < 0 || newY > 49 ||
                        matrix.get(newX, newY) > 0) {
                        continue;
                    }
                    // Ensure we aren't adding the same tile multiple times
                    if (!fillQueue.find((item) => item.x === newX && item.y === newY)) {
                        fillQueue.push({ x: newX, y: newY });
                    }
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
    addMatrices: function(...matrixWeightPairs) {

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
}

module.exports = BasePlanner;