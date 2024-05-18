const overlay = require("./overlay");
const matrixUtility = require("./base.matrixUtility");
const stampUtility = require("./base.stampUtility");
const stamps = require("./base.stamps");
const PlanBuilder = require("./base.planBuilder");
const {
    MAX_VALUE,
    EXCLUSION_ZONE,
    structureToNumber,
} = require("./base.planningConstants");

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_SOURCES = 0.85;
const WEIGHT_SOURCES_SPACE = 0.25;
const WEIGHT_EXIT_DIST = -0.7;
const WEIGHT_TERRAIN_DIST = -0.9;

const STAMP_CORE_DIST_PENTALTY = 200;

const SPAWN_STAMP_COUNT = 2;
const EXTENSION_STAMP_COUNT = 1;
const LAB_COUNT = 1;

class BasePlanner {
    run(roomInfo) {
        if (Game.cpu.bucket <= 200) {
            console.log("bucket is empty");
            return;
        }

        if (!this.roomPlan) {
            function defaultScoreFn(stamp, pos, roomPlan, corePos) {
                let totalScore = 0;
                for (let y = 0; y < stamp.layout.length; y++) {
                    for (let x = 0; x < stamp.layout[y].length; x++) {
                        const actualX = pos.x + x;
                        const actualY = pos.y + y;
                        totalScore += weightMatrix.get(actualX, actualY);
                    }
                }

                // We're going to path from our filler's center position to our core and apply a penalty for each distance we are away
                // First, we need a matrix of what our room would look like with our stamp,
                // then we'll mark all planned tiles and terrain as unwalkable
                const pathMatrix = stampUtility.placeStamp(
                    stamp,
                    pos,
                    roomPlan.clone(),
                    terrainMatrix
                );
                for (let x = 0; x < 50; x++) {
                    for (let y = 0; y < 50; y++) {
                        const value = pathMatrix.get(x, y);
                        pathMatrix.set(
                            x,
                            y,
                            terrainMatrix.get(x, y) > 0
                                ? 255
                                : value === 0 ||
                                  value === structureToNumber[EXCLUSION_ZONE]
                                ? 0
                                : value === structureToNumber[STRUCTURE_ROAD]
                                ? 1
                                : 255
                        );
                    }
                }

                // Then we'll simply path and return the path length times a penalty
                const start = new RoomPosition(
                    pos.x,
                    pos.y,
                    roomInfo.room.name
                );
                const goal = {
                    pos: new RoomPosition(
                        corePos.x,
                        corePos.y,
                        roomInfo.room.name
                    ),
                    range: 2,
                };
                const result = PathFinder.search(start, goal, {
                    plainCost: 2,
                    swampCost: 2,
                    maxRooms: 1,
                    roomCallback: function (roomName) {
                        return pathMatrix;
                    },
                });
                if (result.incomplete) {
                    return Infinity;
                }
                return (
                    totalScore + result.path.length * STAMP_CORE_DIST_PENTALTY
                );
            }

            const cpu = Game.cpu.getUsed();

            // Generate our necessary matrices for planning
            const terrainMatrix = matrixUtility.generateTerrainMatrix(
                roomInfo.room.name
            );
            const distanceTransform = matrixUtility.generateDistanceTransform(
                roomInfo.room.name
            );
            const weightMatrix = this.generateWeightMatrix(
                roomInfo,
                terrainMatrix,
                distanceTransform
            );

            const planBuilder = new PlanBuilder(
                terrainMatrix,
                distanceTransform,
                weightMatrix,
                stamps.core,
                roomInfo.room.name
            );

            const upgraderContainer = planBuilder.planUpgraderContainer(
                roomInfo.room.controller.pos
            );

            // Once we have our core, let's plan out our artery roads
            // This will also handle container placement for sources and minerals
            const roadPoints = roomInfo.sources
                .concat({
                    pos: new RoomPosition(
                        upgraderContainer.x,
                        upgraderContainer.y,
                        roomInfo.room.name
                    ),
                })
                .concat(roomInfo.mineral);
            planBuilder.planRoads(roadPoints);

            // Also plan out our future routes to the exits for remotes
            planBuilder.planRemoteRoads(roomInfo.room);

            // Filter out spaces we've already used
            planBuilder.filterUsedSpaces();

            // Resort our spaces by distance to the core
            planBuilder.resortSpaces(
                (a, b) =>
                    planBuilder.floodfillFromCore.get(a.x, a.y) -
                    planBuilder.floodfillFromCore.get(b.x, b.y)
            );

            // Plan our our extension stamp locations
            // (both regular and with spawns)
            planBuilder.placeStamps(
                stamps.extensionStampXWithSpawn,
                SPAWN_STAMP_COUNT,
                defaultScoreFn
            );

            planBuilder.placeStamps(
                stamps.extensionStampX,
                EXTENSION_STAMP_COUNT,
                defaultScoreFn
            );

            planBuilder.filterUsedSpaces();

            // Labs next
            planBuilder.placeStamps(stamps.labs, LAB_COUNT, defaultScoreFn);

            // Connect up straggling roads
            planBuilder.connectStragglingRoads(roomInfo.room.name);

            planBuilder.filterUsedSpaces();
            planBuilder.placeDynamicStructures(roomInfo.room);

            planBuilder.cleanup();
            this.roomPlan = planBuilder.getProduct();

            console.log(
                "planned base in " + (Game.cpu.getUsed() - cpu) + " cpu!"
            );

            // overlay.visualizeCostMatrix(roomInfo.room.name, weightMatrix);
        }

        const mapping = _.omit(structureToNumber, [EXCLUSION_ZONE]);
        overlay.visualizeBasePlan(roomInfo.room.name, this.roomPlan, mapping);
    }

    generateWeightMatrix(roomInfo, terrainMatrix, distanceTransform) {
        const controllerMatrix = {
            matrix: matrixUtility.floodfill(
                roomInfo.room.controller.pos,
                terrainMatrix.clone()
            ),
            weight: WEIGHT_CONTROLLER,
        };
        const sourceMatrices = [];
        for (const source of roomInfo.sources) {
            sourceMatrices.push({
                matrix: matrixUtility.floodfill(
                    source.pos,
                    terrainMatrix.clone()
                ),
                weight: WEIGHT_SOURCES,
            });

            // Discourage building too close to a source
            sourceMatrices.push({
                matrix: matrixUtility.generateNeighbourMatrix(source.pos, 2),
                weight: WEIGHT_SOURCES_SPACE,
            });
        }
        const exitDistMatrix = {
            matrix: matrixUtility.floodfill(
                roomInfo.room.find(FIND_EXIT),
                terrainMatrix.clone()
            ),
            weight: WEIGHT_EXIT_DIST,
        };

        const distMatrix = {
            matrix: distanceTransform,
            weight: WEIGHT_TERRAIN_DIST,
        };

        return matrixUtility.normalizeMatrix(
            matrixUtility.addScoreMatrices(
                controllerMatrix,
                ...sourceMatrices,
                exitDistMatrix,
                distMatrix
            ),
            MAX_VALUE - 1
        );
    }
}

module.exports = BasePlanner;
