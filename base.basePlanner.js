const overlay = require("./overlay");
const matrixUtility = require("./base.matrixUtility");
const stamps = require("./base.stamps");
const PlanBuilder = require("./base.planBuilder");
const RCLPlanner = require("./base.RCLPlanner");
const {
    serializeBasePlan,
    deserializeBasePlan,
    runTests,
} = require("./base.serializeBasePlan");
const {
    MAX_VALUE,
    EXCLUSION_ZONE,
    structureToNumber,
    numberToStructure,
    MAX_RCL,
    TITLE_SIZE,
    HEADER_SIZE,
} = require("./base.planningConstants");
const { getPlan, savePlan, savePlanData } = require("./base.planningUtility");

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_SOURCES = 0.85;
const WEIGHT_EXIT_DIST = -0.7;
const WEIGHT_TERRAIN_DIST = -0.9;

const STAMP_COUNT_SPAWN = 2;
const STAMP_COUNT_EXTENSION = 2;
const STAMP_COUNT_LAB = 1;

const BUCKET_MINIMUM = 300;

class BasePlanner {
    generateNewRoomPlan(roomInfo) {
        if (Game.cpu.bucket <= BUCKET_MINIMUM) {
            return;
        }

        const totalCpu = Game.cpu.getUsed();
        let cpu = Game.cpu.getUsed();
        this.printDebugMessage(
            "<" +
                "-".repeat(TITLE_SIZE) +
                " Tyrant's Base Planner V1.0.2 " +
                "-".repeat(TITLE_SIZE) +
                ">"
        );

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
        planBuilder.placeStamps(stamps.extensionStampX, STAMP_COUNT_EXTENSION);

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

        this.printDebugMessage(
            `🟢 Completed plan creation in ${(Game.cpu.getUsed() - cpu).toFixed(
                DEBUG.cpuPrintoutFigures
            )} CPU`
        );
        cpu = Game.cpu.getUsed();

        //#region RCL planning

        const rclPlanner = new RCLPlanner(
            structures,
            planBuilder.corePos,
            roomInfo
        );
        rclPlanner.planGenericStructures();
        rclPlanner.planContainers(
            planBuilder.upgraderContainer,
            planBuilder.mineralContainer,
            planBuilder.sourceContainers
        );
        rclPlanner.planTowers();
        rclPlanner.planRamparts(ramparts);
        rclPlanner.planRoads(stamps.core);
        const { rclStructures, rclRamparts } = rclPlanner.getProduct();

        //#endregion

        this.printDebugMessage(
            `🟢 Completed RCL planning in ${(Game.cpu.getUsed() - cpu).toFixed(
                DEBUG.cpuPrintoutFigures
            )} CPU`
        );
        cpu = Game.cpu.getUsed();

        // Save the serialized plans to memory
        savePlan(
            roomInfo.room.name,
            serializeBasePlan(rclStructures, rclRamparts)
        );
        savePlanData(
            roomInfo.room.name,
            "upgraderContainerPos",
            planBuilder.upgraderContainer
        );
        savePlanData(
            roomInfo.room.name,
            "mineralContainerPos",
            planBuilder.mineralContainer
        );
        savePlanData(
            roomInfo.room.name,
            "sourceContainerPositions",
            planBuilder.sourceContainers
        );
        this.printDebugMessage(
            `🟢 Completed plan serialization in ${(
                Game.cpu.getUsed() - cpu
            ).toFixed(DEBUG.cpuPrintoutFigures)} CPU`
        );

        //#region Debug
        if (DEBUG.testBasePlanSerialization) {
            runTests(rclStructures, rclRamparts);
        }

        this.printDebugMessage(
            "-".repeat(HEADER_SIZE) +
                " Completed base planning in " +
                (Game.cpu.getUsed() - totalCpu).toFixed(
                    DEBUG.cpuPrintoutFigures
                ) +
                " CPU " +
                "-".repeat(HEADER_SIZE)
        );

        //#endregion
    }

    visualizePlan(roomName, rcl = Game.time % MAX_RCL) {
        const plan = getPlan(roomName);
        if (!plan) {
            return;
        }
        const { structures, ramparts } = deserializeBasePlan(plan, rcl);
        overlay.visualizeBasePlan(
            roomName,
            structures,
            ramparts,
            structureToNumber
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
