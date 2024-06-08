const overlay = require("./overlay");
const matrixUtility = require("./base.matrixUtility");
const stamps = require("./base.stamps");
const PlanBuilder = require("./base.planBuilder");
const RCLPlanner = require("./base.RCLPlanner");
const {
    serializeBasePlan,
    deserializeBasePlan,
    verifyIndenticality,
    runTests,
} = require("./base.serializeBasePlan");
const {
    MAX_VALUE,
    EXCLUSION_ZONE,
    structureToNumber,
    numberToStructure,
    MAX_RCL,
} = require("./base.planningConstants");

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_SOURCES = 0.85;
const WEIGHT_EXIT_DIST = -0.7;
const WEIGHT_TERRAIN_DIST = -0.9;

const STAMP_COUNT_SPAWN = 2;
const STAMP_COUNT_EXTENSION = 2;
const STAMP_COUNT_LAB = 1;

class BasePlanner {
    run(roomInfo) {
        if (Game.cpu.bucket <= 250) {
            console.log("bucket is empty");
            return;
        }

        if (!this.serializedPlans) {
            const cpu = Game.cpu.getUsed();
            this.printDebugMessage(
                "-".repeat(20) +
                    " Tyrant's Base Planner V1.0.0 " +
                    "-".repeat(20)
            );
            this.printDebugMessage("Beginning plan creation...");

            //#region Initialization

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

            //#endregion

            //#region Room Plan

            const planBuilder = new PlanBuilder(
                terrainMatrix,
                distanceTransform,
                weightMatrix,
                stamps.core,
                roomInfo
            );

            planBuilder.planUpgraderContainer();
            planBuilder.planExtractor();
            planBuilder.planMiningSpots();

            // Resort our spaces by distance to the core
            planBuilder.resortSpaces(
                (a, b) =>
                    planBuilder.floodfillFromCore.get(a.x, a.y) -
                    planBuilder.floodfillFromCore.get(b.x, b.y)
            );

            // Plan out our future routes to the exits for remotes
            planBuilder.planRemoteRoads();

            // Spawn stamps
            planBuilder.placeStamps(
                stamps.extensionStampXWithSpawn,
                STAMP_COUNT_SPAWN
            );

            // Lab stamps
            planBuilder.placeStamps(stamps.labs, STAMP_COUNT_LAB);

            // Ordinary extension stamps
            planBuilder.placeStamps(
                stamps.extensionStampX,
                STAMP_COUNT_EXTENSION
            );

            // Plan our artery roads
            planBuilder.planRoads();

            // Connect up straggling roads
            planBuilder.connectStragglingRoads();

            // Place all of our dynamic structures
            planBuilder.filterBadSpaces();
            planBuilder.placeDynamicStructures();

            // Finally, let's rampart our entire base
            planBuilder.planRamparts();

            // Cleanup any roads placed over terrain
            planBuilder.cleanup();
            const { structures, ramparts } = planBuilder.getProduct();

            //#endregion

            this.printDebugMessage("Completed plan creation...");
            this.printDebugMessage("Beginning RCL planning...");

            //#region RCL planning

            const rclPlanner = new RCLPlanner(
                structures,
                planBuilder.corePos,
                roomInfo
            );
            rclPlanner.planGenericStructures();
            rclPlanner.planContainers(planBuilder.upgraderContainer);
            rclPlanner.planTowers();
            rclPlanner.planRamparts(ramparts);
            rclPlanner.planRoads(stamps.core);
            const { rclStructures, rclRamparts } = rclPlanner.getProduct();

            //#endregion

            this.printDebugMessage("Completed RCL planning...");
            this.printDebugMessage("Beginning plan serialization...");

            this.serializedPlans = serializeBasePlan(
                rclStructures,
                rclRamparts
            );

            if (DEBUG.validateBasePlans) {
                runTests(rclStructures, rclRamparts);
                this.printDebugMessage(
                    "planned base in " + (Game.cpu.getUsed() - cpu) + " cpu!"
                );
            }
        }

        const mapping = _.omit(numberToStructure, [
            structureToNumber[EXCLUSION_ZONE],
        ]);
        const { structures, ramparts } = deserializeBasePlan(
            this.serializedPlans,
            (Game.time % MAX_RCL) + 1
        );
        overlay.visualizeBasePlan(
            roomInfo.room.name,
            structures,
            ramparts,
            mapping
        );
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

    printDebugMessage(message) {
        if (DEBUG.validateBasePlans) {
            console.log(message);
        }
    }
}

module.exports = BasePlanner;
