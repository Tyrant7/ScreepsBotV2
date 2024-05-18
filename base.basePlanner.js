const overlay = require("./overlay");
const matrixUtility = require("./base.matrixUtility");
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

const STAMP_COUNT_SPAWN = 2;
const STAMP_COUNT_EXTENSION = 1;
const STAMP_COUNT_LAB = 1;

class BasePlanner {
    run(roomInfo) {
        if (Game.cpu.bucket <= 200) {
            console.log("bucket is empty");
            return;
        }

        if (!this.roomPlan) {
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
                roomInfo
            );

            const upgraderContainer = planBuilder.planUpgraderContainer();

            // Plan out artery roads
            // This will also handle container placement for minerals and container + links for sources
            planBuilder.planRoads(
                roomInfo.sources
                    .concat({
                        pos: new RoomPosition(
                            upgraderContainer.x,
                            upgraderContainer.y,
                            roomInfo.room.name
                        ),
                    })
                    .concat(roomInfo.mineral)
            );

            // Also plan out our future routes to the exits for remotes
            planBuilder.planRemoteRoads();

            // Resort our spaces by distance to the core
            planBuilder.resortSpaces(
                (a, b) =>
                    planBuilder.floodfillFromCore.get(a.x, a.y) -
                    planBuilder.floodfillFromCore.get(b.x, b.y)
            );

            // Filter out spaces we've already used for better performance when placing our stamps
            planBuilder.filterUsedSpaces();
            planBuilder.placeStamps(
                stamps.extensionStampXWithSpawn,
                STAMP_COUNT_SPAWN
            );

            planBuilder.filterUsedSpaces();
            planBuilder.placeStamps(
                stamps.extensionStampX,
                STAMP_COUNT_EXTENSION
            );

            // Labs next
            planBuilder.filterUsedSpaces();
            planBuilder.placeStamps(stamps.labs, STAMP_COUNT_LAB);

            // Cleanup any roads placed over terrain
            planBuilder.cleanup();

            // Connect up straggling roads
            planBuilder.connectStragglingRoads();

            // Place all of our dynamic structures
            planBuilder.filterUsedSpaces();
            planBuilder.placeDynamicStructures();

            // Cleanup any roads placed over terrain
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
