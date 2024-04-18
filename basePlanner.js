const overlay = require("./overlay");

class BasePlanner {
    run(roomInfo) {
        if (!this.flood) {
            const terrain = Game.map.getRoomTerrain(roomInfo.room.name);
            this.flood = planningUtility.floodfill(roomInfo.room.controller.pos, terrain);
        }

        overlay.visualizeCostMatrix(roomInfo.room.name, this.flood);
    }
}

const planningUtility = {
    floodfill: function(fromPos, terrain) {
        const matrix = new PathFinder.CostMatrix();
        
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

        const fillQueue = [{ x: fromPos.x, y: fromPos.y }];
        while (fillQueue.length > 0) {
            const next = fillQueue.shift();

            // Score the first tile to base distances off of regardless of terrain type
            if (next.x === fromPos.x && next.y === fromPos.y) {
                matrix.set(next.x, next.y, 1);
            }
            else if (terrain.get(next.x, next.y) === TERRAIN_MASK_WALL) {
                // If the tile is a terrain tile, let's score it as the worst possible score
                // Let's also avoid scoring through it
                matrix.set(next.x, next.y, 255);
                continue;
            }
            else {
                // Otherwise, score the current tile according to the min of its neighbours + 1
                const minNeighbourScore = getMinNeighbourScore(next.x, next.y);
                matrix.set(next.x, next.y, minNeighbourScore + 1);
            }

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

        // Adjust the score of our starting tile if it was unwalkable
        if (terrain.get(fromPos.x, fromPos.y) === TERRAIN_MASK_WALL) {
            matrix.set(fromPos.x, fromPos.y, 255);
        }

        return matrix;
    }
}

module.exports = BasePlanner;