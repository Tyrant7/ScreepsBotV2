const matrixUtility = require("./base.matrixUtility");
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

const RAMPART_RCL = 5;

const STRUCTURE_GROUP_SIZE = 10;

const SINGLE_USE_ROAD_PLAN_COST = 3;
const MULTIPLE_USE_ROAD_PLAN_COST = 2;

// We'll place these based on different criteria than simply when and where we're able to
const SPECIAL_RCL_STRUCTURES = [
    STRUCTURE_ROAD,
    STRUCTURE_CONTAINER,
    STRUCTURE_TOWER,
];

class RCLPlanner {
    constructor(structures, corePos, roomInfo) {
        this.rclStructures = Array.from(
            { length: MAX_RCL + 1 },
            () => new PathFinder.CostMatrix()
        );
        this.rclRamparts = Array.from(
            { length: MAX_RCL + 1 },
            () => new PathFinder.CostMatrix()
        );

        this.structures = structures;
        this.corePos = corePos;
        this.ri = roomInfo;

        // Track which structures we need to place and how many we've placed already
        this.plannedStructures = {};
        this.placedStructureCounts = {};
        for (const key in MAX_STRUCTURES) {
            this.plannedStructures[structureToNumber[key]] = [];
            this.placedStructureCounts[structureToNumber[key]] = 0;
        }
        matrixUtility.iterateMatrix((x, y) => {
            const s = this.structures.get(x, y);
            if (!s || s === structureToNumber[EXCLUSION_ZONE]) {
                return;
            }
            this.plannedStructures[s].push({ x, y });
        });
    }

    /**
     * Plans out each structure type for each RCL in clusters based on distance to the core.
     */
    planGenericStructures() {
        // Iterate over each structure type, and plan them closest to furthest from the core,
        // moving up an RCL when we hit the placement limit for the current one
        for (const structureType in this.plannedStructures) {
            if (
                SPECIAL_RCL_STRUCTURES.includes(
                    numberToStructure[structureType]
                )
            ) {
                continue;
            }

            const structures = [...this.plannedStructures[structureType]];
            const sorted = [];
            while (structures.length) {
                let lastPos = this.corePos;
                const currentGroup = [];
                for (let i = 0; i < STRUCTURE_GROUP_SIZE; i++) {
                    if (!structures.length) {
                        break;
                    }
                    const closest = structures.reduce((best, curr) => {
                        return Math.max(
                            Math.abs(lastPos.x - curr.x),
                            Math.abs(lastPos.y - curr.y)
                        ) <
                            Math.max(
                                Math.abs(lastPos.x - best.x),
                                Math.abs(lastPos.y - best.y)
                            )
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
                const count = this.placedStructureCounts[structureType];
                const mapping =
                    CONTROLLER_STRUCTURES[numberToStructure[structureType]];
                const currentRCL = Object.entries(mapping).find(
                    ([key, value]) => value > count
                )[0];

                this.rclStructures[currentRCL].set(
                    structure.x,
                    structure.y,
                    structureType
                );
                this.placedStructureCounts[structureType]++;
            }
        }
    }

    /**
     * Plans out container RCLs based on constants provided in this module.
     * @param {{ x: number, y: number }} upgraderContainerPos The planned position of the upgrader container.
     */
    planContainers(upgraderContainerPos) {
        // Let's push all containers at appropriate RCLs based on their type
        const identifyContainerRCL = (pos) => {
            for (let x = pos.x - 1; x <= pos.x + 1; x++) {
                for (let y = pos.y - 1; y <= pos.y + 1; y++) {
                    // Source container
                    if (
                        this.ri.sources.find(
                            (s) => s.pos.x === x && s.pos.y === y
                        )
                    ) {
                        return SOURCE_CONTAINER_RCL;
                    }

                    if (
                        this.ri.mineral.pos.x === x &&
                        this.ri.mineral.pos.y === y
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
        };
        matrixUtility.iterateMatrix((x, y) => {
            if (
                this.structures.get(x, y) ===
                structureToNumber[STRUCTURE_CONTAINER]
            ) {
                const rcl = identifyContainerRCL({ x, y });
                this.rclStructures[rcl].set(
                    x,
                    y,
                    structureToNumber[STRUCTURE_CONTAINER]
                );
            }
        });
    }

    /**
     * Plans towers for each RCL by spreading them out the from the currently built towers,
     * starting with the closest tower to the core.
     */
    planTowers() {
        const towerNumber = structureToNumber[STRUCTURE_TOWER];
        const placedTowers = [];
        const remainingTowers = [...this.plannedStructures[towerNumber]];
        function sumDistance(tower) {
            return placedTowers.reduce(
                (sum, t) =>
                    sum +
                    Math.max(Math.abs(t.x - tower.x) + Math.abs(t.y - tower.y)),
                0
            );
        }
        while (remainingTowers.length) {
            const next = remainingTowers.reduce((best, curr) => {
                return sumDistance(curr) > sumDistance(best) ? curr : best;
            });
            placedTowers.push(next);
            remainingTowers.splice(remainingTowers.indexOf(next), 1);
            const currentRCL = Object.entries(
                CONTROLLER_STRUCTURES[STRUCTURE_TOWER]
            ).find(([key, value]) => value >= placedTowers.length)[0];
            this.rclStructures[currentRCL].set(next.x, next.y, towerNumber);
        }
    }

    /**
     * Plans ramparts for RCL of `RAMPART_RCL`.
     * @param {PathFinder.CostMatrix} ramparts A costmatrix of all planned ramparts.
     */
    planRamparts(ramparts) {
        // Place ramparts in plans above our minimum threshold
        matrixUtility.iterateMatrix((x, y) => {
            if (ramparts.get(x, y)) {
                this.rclRamparts[RAMPART_RCL].set(x, y, MAX_VALUE);
                if (
                    this.structures.get(x, y) ===
                    structureToNumber[STRUCTURE_ROAD]
                ) {
                    this.rclStructures[RAMPART_RCL].set(
                        x,
                        y,
                        structureToNumber[STRUCTURE_ROAD]
                    );
                }
            }
        });
    }

    /**
     * Plans roads for each RCL, taking into account only structures that are relevant at that RCL.
     * @param {{}} coreStamp The stamp of the core used when planning making this plan. Used for determining
     * necessary path distance to reach our core.
     */
    planRoads(coreStamp) {
        // For roads, let's ensure that we only plan roads to connect what we want to
        const roadMatrix = new PathFinder.CostMatrix();
        matrixUtility.iterateMatrix((x, y) => {
            if (
                this.structures.get(x, y) === structureToNumber[STRUCTURE_ROAD]
            ) {
                roadMatrix.set(x, y, SINGLE_USE_ROAD_PLAN_COST);
                return;
            }
            roadMatrix.set(x, y, MAX_VALUE);
        });
        let i = 0;
        let extraTarget;
        for (const rcl of this.rclStructures) {
            const rclStructures = [];
            const containers = [];
            matrixUtility.iterateMatrix((x, y) => {
                if (rcl.get(x, y)) {
                    rclStructures.push({ x, y });
                }
                if (this.rclRamparts[i].get(x, y)) {
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
                            pos: this.ri.room.getPositionAt(c.x, c.y),
                            range: 1,
                        };
                    }),
                    {
                        pos: this.corePos,
                        range:
                            Math.min(coreStamp.center.x, coreStamp.center.y) -
                            1,
                    },
                ];
                if (extraTarget) {
                    goals.push({
                        pos: extraTarget,
                        range: 1,
                    });
                }
                for (const goal of goals) {
                    const result = PathFinder.search(
                        this.ri.room.getPositionAt(structure.x, structure.y),
                        goal,
                        {
                            maxRooms: 1,
                            maxOps: 2500,
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

                        // Slightly encourage road reuse between paths
                        roadMatrix.set(
                            point.x,
                            point.y,
                            MULTIPLE_USE_ROAD_PLAN_COST
                        );

                        // Encourage keeping more roads accessible by pathing to
                        // the last road instead in addition to the core
                        extraTarget = point;
                    }
                }
            }
            i++;
        }
    }

    /**
     * Gets the completed RCL plans for structures and ramparts. Each RCL contains only the additional structures
     * from the previous RCL, and not all structures found at that RCL.
     * @returns {{ rclStructures: PathFinder.CostMatrix[], rclRamparts: PathFinder.CostMatrix[] }}
     * An object with all RCL structures, and RCL ramparts, where each property is an array of length MAX_RCL + 1.
     */
    getProduct() {
        return {
            rclStructures: this.rclStructures,
            rclRamparts: this.rclRamparts,
        };
    }
}

module.exports = RCLPlanner;
