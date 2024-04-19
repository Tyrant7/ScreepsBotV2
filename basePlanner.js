const overlay = require("./overlay");

class BasePlanner {
    run(roomInfo) {
        if (!this.flood) {
            const terrainMatrix = planningUtility.generateTerrainMatrix(roomInfo.room.name);
            this.flood = planningUtility.floodfill(roomInfo.room.controller.pos, terrainMatrix);
        }

        overlay.visualizeCostMatrix(roomInfo.room.name, this.flood);
    }
}

const planningUtility = {
    generateTerrainMatrix: function(roomName) {
        const matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);
        for (let x = 0; x < 49; x++) {
            for (let y = 0; y < 49; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 255);
                }
            }
        }
        return matrix;
    },

    floodfill: function(fromPos, matrix) {        
        function getMinNeighbourScore(posX, posY) {
            let minScore = 255;
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    // Ensure valid position
                    const newX = posX + x;
                    const newY = posY + y;
                    if (newX < 0 || newX > 49 || newY < 0 || newY > 49) {
                        continue;
                    }

                    // If this is our starting tile, let's return zero
                    if (newX === fromPos.x && newY === fromPos.y) {
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

        const originalScore = matrix.get(fromPos.x, fromPos.y);
        const fillQueue = [{ x: fromPos.x, y: fromPos.y }];
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

        // Adjust the score of our starting tile if it was already scored
        matrix.set(fromPos.x, fromPos.y, originalScore);
        return matrix;
    }
}

module.exports = BasePlanner;