const matrixUtility = require("./base.matrixUtility");
const utility = require("./base.planningUtility");
const { core } = require("./base.stamps");
const {
    MAX_VALUE,
    EXCLUSION_ZONE,
    structureToNumber,
    numberToStructure,
    MAX_STRUCTURES,
    MAX_RCL,
} = require("./base.planningConstants");

const SOURCE_CONTAINER_RCL = 2;
const UPGRADER_CONTAINER_RCL = 3;
const MINERAL_CONTAINER_RCL = 6;
const MISC_CONTAINER_RCL = 3;

const STRUCTURE_GROUP_SIZE = 10;

class RCLPlanner {
    planBuildRCLs(
        structures,
        ramparts,
        corePos,
        terrainMatrix,
        roomInfo,
        upgraderContainerPos
    ) {
        const RCLPlans = Array.from(
            { length: MAX_RCL + 1 },
            () => new PathFinder.CostMatrix()
        );

        // We'll place these based on different criteria
        const skipDistancePlans = [
            STRUCTURE_ROAD,
            STRUCTURE_CONTAINER,
            STRUCTURE_TOWER,
        ];

        // Track which structures we need to place and how many we've placed already
        const plannedStructures = {};
        const placedStructureCounts = {};
        for (const key in MAX_STRUCTURES) {
            plannedStructures[structureToNumber[key]] = [];
            placedStructureCounts[structureToNumber[key]] = 0;
        }
        matrixUtility.iterateMatrix((x, y) => {
            const s = structures.get(x, y);
            if (!s || s === structureToNumber[EXCLUSION_ZONE]) {
                return;
            }
            plannedStructures[s].push({ x, y });
        });

        // Then iterate over each structure type, and plan them closest to furthest from the core,
        // moving up an RCL when we hit the placement limit for the current one
        for (const structureType in plannedStructures) {
            if (skipDistancePlans.includes(numberToStructure[structureType])) {
                continue;
            }

            const structures = [...plannedStructures[structureType]];
            const sorted = [];
            while (structures.length) {
                let lastPos = corePos;
                const currentGroup = [];
                for (let i = 0; i < STRUCTURE_GROUP_SIZE; i++) {
                    if (!structures.length) {
                        break;
                    }
                    const closest = structures.reduce((best, curr) => {
                        return Math.abs(lastPos.x - curr.x) +
                            Math.abs(lastPos.y - curr.y) <
                            Math.abs(lastPos.x - best.x) +
                                Math.abs(lastPos.y - best.y)
                            ? curr
                            : best;
                    });
                    structures.splice(structures.indexOf(closest), 1);
                    currentGroup.push(closest);
                    lastPos = currentGroup[0];
                }
                sorted.push(...currentGroup);
            }

            for (const structure of sorted) {
                const count = placedStructureCounts[structureType];
                const mapping =
                    CONTROLLER_STRUCTURES[numberToStructure[structureType]];
                const currentRCL = Object.entries(mapping).find(
                    ([key, value]) => value > count
                )[0];

                RCLPlans[currentRCL].set(
                    structure.x,
                    structure.y,
                    structureType
                );
                placedStructureCounts[structureType]++;
            }
        }

        // Let's push all containers at appropriate RCLs based on their type
        function identifyContainerRCL(pos) {
            for (let x = pos.x - 1; x <= pos.x + 1; x++) {
                for (let y = pos.y - 1; y <= pos.y + 1; y++) {
                    // Source container
                    if (
                        roomInfo.sources.find(
                            (s) => s.pos.x === x && s.pos.y === y
                        )
                    ) {
                        return SOURCE_CONTAINER_RCL;
                    }

                    if (
                        roomInfo.mineral.pos.x === x &&
                        roomInfo.mineral.pos.y === y
                    ) {
                        return MINERAL_CONTAINER_RCL;
                    }

                    if (
                        upgraderContainerPos.x === x &&
                        upgraderContainerPos.y === y
                    ) {
                        return UPGRADER_CONTAINER_RCL;
                    }
                }
            }
            return MISC_CONTAINER_RCL;
        }
        matrixUtility.iterateMatrix((x, y) => {
            if (
                structures.get(x, y) === structureToNumber[STRUCTURE_CONTAINER]
            ) {
                const rcl = identifyContainerRCL({ x, y });
                RCLPlans[rcl].set(x, y, structureToNumber[STRUCTURE_CONTAINER]);
            }
        });

        // Now that we've planned out all of the basic structures, we can revisit our exceptions
        // For roads, let's ensure that we only plan roads to connect what we want to
        const roadMatrix = new PathFinder.CostMatrix();
        matrixUtility.iterateMatrix((x, y) => {
            if (structures.get(x, y) === structureToNumber[STRUCTURE_ROAD]) {
                roadMatrix.set(x, y, 1);
                return;
            }
            roadMatrix.set(x, y, MAX_VALUE);
        });
        for (const rcl of RCLPlans) {
            const rclStructures = [];
            const containers = [];
            matrixUtility.iterateMatrix((x, y) => {
                if (rcl.get(x, y)) {
                    rclStructures.push({ x, y });
                }
                if (rcl.get(x, y) === structureToNumber[STRUCTURE_CONTAINER]) {
                    containers.push({ x, y });
                }
            });

            // Let's path back to our core from each structures using only our planned roads,
            // adding any that we use to this RCL's plan
            // Additionally, we should also path between each container to ensure good accessibility within our base
            for (const structure of rclStructures) {
                const goals = [
                    ...containers.map((c) => {
                        return {
                            pos: roomInfo.room.getPositionAt(c.x, c.y),
                            range: 1,
                        };
                    }),
                    {
                        pos: corePos,
                        range: Math.min(core.center.x, core.center.y) - 1,
                    },
                ];
                for (const goal of goals) {
                    const result = PathFinder.search(
                        roomInfo.room.getPositionAt(structure.x, structure.y),
                        goal,
                        {
                            roomCallback: function (roomName) {
                                return roadMatrix;
                            },
                        }
                    );
                    for (const point of result.path) {
                        rcl.set(
                            point.x,
                            point.y,
                            structureToNumber[STRUCTURE_ROAD]
                        );
                    }
                }
            }
        }

        // Now we have a plan of our RCL deltas, let's combine each plan with all lower plans
        for (let i = 0; i < RCLPlans.length; i++) {
            for (let past = 0; past < i; past++) {
                RCLPlans[i] = matrixUtility.combineMatrices(
                    RCLPlans[i],
                    RCLPlans[past]
                );
            }
        }

        return RCLPlans;
    }
}

module.exports = RCLPlanner;
