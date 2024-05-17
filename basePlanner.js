const overlay = require("./overlay");
const matrixUtility = require("./base.matrixUtility");
const stampUtility = require("./base.stampUtility");
const {
    MAX_VALUE,
    MAX_BUILD_AREA,
    MIN_BUILD_AREA,
    EXCLUSION_ZONE,
    structureToNumber,
} = require("./base.planningConstants");

const WEIGHT_CONTROLLER = 1.2;
const WEIGHT_SOURCES = 0.85;
const WEIGHT_SOURCES_SPACE = 0.25;
const WEIGHT_EXIT_DIST = -0.7;
const WEIGHT_TERRAIN_DIST = -0.9;

const CHECK_MAXIMUM = 20;
const STAMP_CORE_DIST_PENTALTY = 200;

const SPAWN_STAMP_COUNT = 2;
const EXTENSION_STAMP_COUNT = 1;
const LAB_COUNT = 1;

const CONNECTIVE_ROAD_PENALTY_PLAINS = 3;
const CONNECTIVE_ROAD_PENALTY_SWAMP = 5;

const MAX_STRUCTURES = {};
for (const key in CONTROLLER_STRUCTURES) {
    MAX_STRUCTURES[key] = parseInt(
        Object.values(CONTROLLER_STRUCTURES[key]).slice(-1)
    );
}

class BasePlanner {
    run(roomInfo) {
        if (Game.cpu.bucket <= 200) {
            console.log("bucket is empty");
            return;
        }

        if (!this.roomPlan) {
            function placeStamps(stamp, count, roomPlan, scoreFn) {
                for (let i = 0; i < count; i++) {
                    // Find the best stamp we can place currently
                    // Only consider the best suspected locations
                    let bestStampData;
                    let checkedLocations = 0;
                    for (const space of spaces) {
                        if (checkedLocations >= CHECK_MAXIMUM) {
                            break;
                        }

                        // Consider all orientations
                        let checkedAtLeastOne = false;
                        for (const transform of stampUtility.getTransformationList()) {
                            const transformedStamp = transform(stamp);
                            if (
                                stampUtility.stampFits(
                                    transformedStamp,
                                    space,
                                    distanceTransform,
                                    roomPlan
                                )
                            ) {
                                // Score the stamp
                                const score = scoreFn(
                                    transformedStamp,
                                    space,
                                    roomPlan
                                );
                                checkedAtLeastOne = true;

                                // Lower scores are better
                                if (
                                    !bestStampData ||
                                    score < bestStampData.score
                                ) {
                                    bestStampData = {
                                        stamp: transformedStamp,
                                        score: score,
                                        pos: space,
                                    };
                                }
                            }
                        }

                        if (checkedAtLeastOne) {
                            checkedLocations++;
                        }
                    }

                    // Once we've found the current best stamp, let's place it
                    if (bestStampData) {
                        roomPlan = stampUtility.placeStamp(
                            bestStampData.stamp,
                            bestStampData.pos,
                            roomPlan,
                            terrainMatrix
                        );
                    }
                }
                return roomPlan;
            }
            function defaultScoreFn(stamp, pos, roomPlan) {
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

            this.roomPlan = new PathFinder.CostMatrix();
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

            // Let's sort all spaces by score
            let spaces = [];
            for (let x = 2; x < 48; x++) {
                for (let y = 2; y < 48; y++) {
                    if (terrainMatrix.get(x, y) === 0) {
                        spaces.push({ x, y });
                    }
                }
            }
            spaces.sort(
                (a, b) =>
                    weightMatrix.get(a.x, a.y) - weightMatrix.get(b.x, b.y)
            );

            // Now let's check each space in order until we find one that fits our core
            let corePos;
            for (const space of spaces) {
                let bestStampData;
                for (const transform of stampUtility.getTransformationList()) {
                    const transformedStamp = transform(stamps.core);
                    if (
                        stampUtility.stampFits(
                            transformedStamp,
                            space,
                            distanceTransform,
                            this.roomPlan
                        )
                    ) {
                        // Score the stamp
                        let score = 0;
                        for (
                            let y = 0;
                            y < transformedStamp.layout.length;
                            y++
                        ) {
                            for (
                                let x = 0;
                                x < transformedStamp.layout[y].length;
                                x++
                            ) {
                                const actualX =
                                    space.x - transformedStamp.center.x + x;
                                const actualY =
                                    space.y - transformedStamp.center.y + y;
                                score += weightMatrix.get(actualX, actualY);
                            }
                        }

                        // Lower scores are better
                        if (!bestStampData || score < bestStampData.score) {
                            bestStampData = {
                                stamp: transformedStamp,
                                score: score,
                                pos: space,
                            };
                        }
                    }
                }
                if (bestStampData) {
                    this.roomPlan = stampUtility.placeStamp(
                        bestStampData.stamp,
                        bestStampData.pos,
                        this.roomPlan,
                        terrainMatrix
                    );
                    corePos = space;
                    break;
                }
            }

            // Next we'll find the position near our controller with the most open spaces,
            // using distance to our core as a tiebreaker
            const floodfillFromCore = matrixUtility.floodfill(
                corePos,
                terrainMatrix.clone()
            );
            let bestContainerSpot;
            let bestOpenSpaces = 0;
            let bestDist = Infinity;
            for (let x = -2; x <= 2; x++) {
                for (let y = -2; y <= 2; y++) {
                    const newX = roomInfo.room.controller.pos.x + x;
                    const newY = roomInfo.room.controller.pos.y + y;
                    if (
                        newX < MIN_BUILD_AREA ||
                        newX > MAX_BUILD_AREA ||
                        newY < MIN_BUILD_AREA ||
                        newY > MAX_BUILD_AREA
                    ) {
                        continue;
                    }
                    if (
                        terrainMatrix.get(newX, newY) !== 0 ||
                        this.roomPlan.get(newX, newY) !== 0
                    ) {
                        continue;
                    }

                    // Count open neighbouring spaces to this one
                    let openSpaces = 0;
                    for (let x = -1; x <= 1; x++) {
                        for (let y = -1; y <= 1; y++) {
                            const neighbourX = newX + x;
                            const neighbourY = newY + y;
                            if (
                                neighbourX < MIN_BUILD_AREA ||
                                neighbourX > MAX_BUILD_AREA ||
                                neighbourY < MIN_BUILD_AREA ||
                                neighbourY > MAX_BUILD_AREA
                            ) {
                                continue;
                            }
                            if (
                                terrainMatrix.get(neighbourX, neighbourY) !==
                                    0 ||
                                this.roomPlan.get(neighbourX, neighbourY) !== 0
                            ) {
                                continue;
                            }
                            openSpaces++;
                        }
                    }

                    const dist = floodfillFromCore.get(newX, newY);
                    const better =
                        !bestContainerSpot ||
                        openSpaces > bestOpenSpaces ||
                        // Use distance as tiebreaker
                        (openSpaces === bestOpenSpaces && dist < bestDist);
                    if (better) {
                        bestDist = dist;
                        bestOpenSpaces = openSpaces;
                        bestContainerSpot = { x: newX, y: newY };
                    }
                }
            }

            // We'll place the container and mark all spots around it as invalid as long as there isn't something already there
            this.roomPlan.set(
                bestContainerSpot.x,
                bestContainerSpot.y,
                structureToNumber[STRUCTURE_CONTAINER]
            );
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const newX = bestContainerSpot.x + x;
                    const newY = bestContainerSpot.y + y;
                    if (this.roomPlan.get(newX, newY) === 0) {
                        this.roomPlan.set(
                            newX,
                            newY,
                            structureToNumber[EXCLUSION_ZONE]
                        );
                    }
                }
            }

            // Now let's sort our spaces from distance to the core
            spaces = spaces.sort(
                (a, b) =>
                    floodfillFromCore.get(a.x, a.y) -
                    floodfillFromCore.get(b.x, b.y)
            );

            // Once we have our core, let's plan out our artery roads
            // This will also handle container placement for sources and minerals
            const roadPoints = roomInfo.sources
                .concat({
                    pos: new RoomPosition(
                        bestContainerSpot.x,
                        bestContainerSpot.y,
                        roomInfo.room.name
                    ),
                })
                .concat(roomInfo.mineral);
            const roadMatrix = this.planRoads(
                roadPoints,
                roomInfo.room.name,
                corePos,
                this.roomPlan
            );
            this.roomPlan = matrixUtility.combineMatrices(
                this.roomPlan,
                roadMatrix
            );

            // Let's also plan out our future routes to the exits for remotes
            this.roomPlan = this.planExitExclusionZones(
                roomInfo,
                corePos,
                this.roomPlan,
                terrainMatrix
            );

            // Filter out spaces we've already used
            spaces = spaces.filter(
                (space) => this.roomPlan.get(space.x, space.y) === 0
            );

            // Then, we'll plan our our extension stamp locations
            // (both regular and with spawns)
            this.roomPlan = placeStamps(
                stamps.extensionStampXWithSpawn,
                SPAWN_STAMP_COUNT,
                this.roomPlan,
                defaultScoreFn
            );
            this.roomPlan = placeStamps(
                stamps.extensionStampX,
                EXTENSION_STAMP_COUNT,
                this.roomPlan,
                defaultScoreFn
            );

            // Filter out spaces we've already used
            spaces = spaces.filter(
                (space) => this.roomPlan.get(space.x, space.y) === 0
            );

            // And labs
            this.roomPlan = placeStamps(
                stamps.labs,
                LAB_COUNT,
                this.roomPlan,
                defaultScoreFn
            );

            // Next, we'll connect up any roads we've placed that aren't currently connected
            const stragglingRoadConnectors = this.connectStragglingRoads(
                roomInfo.room.name,
                corePos,
                this.roomPlan
            );
            this.roomPlan = matrixUtility.combineMatrices(
                this.roomPlan,
                stragglingRoadConnectors
            );

            // Filter out spaces we've already used
            spaces = spaces.filter(
                (space) => this.roomPlan.get(space.x, space.y) === 0
            );

            // Next, we'll place our remaining extensions, we'll plan extra for tower and observer placement positions later
            // Let's start by counting how many extensions we have already
            let placedExtensions = 0;
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                    if (
                        this.roomPlan.get(x, y) ===
                        structureToNumber[STRUCTURE_EXTENSION]
                    ) {
                        placedExtensions++;
                    }
                }
            }

            const remainingExtensions =
                MAX_STRUCTURES[STRUCTURE_EXTENSION] -
                placedExtensions +
                MAX_STRUCTURES[STRUCTURE_TOWER] +
                MAX_STRUCTURES[STRUCTURE_OBSERVER];
            // Here we'll be marking the extensions we place to use as potential tower locations later
            const extensionPositions = [];
            for (let i = 0; i < remainingExtensions; i++) {
                // Find the lowest scoring tile that is also adjacent to a road
                let bestSpot;
                for (const space of spaces) {
                    if (
                        terrainMatrix.get(space.x, space.y) !== 0 ||
                        this.roomPlan.get(space.x, space.y) !== 0
                    ) {
                        continue;
                    }
                    if (
                        space.x < MIN_BUILD_AREA ||
                        space.x > MAX_BUILD_AREA ||
                        space.y < MIN_BUILD_AREA ||
                        space.y > MAX_BUILD_AREA
                    ) {
                        continue;
                    }

                    let hasRoad = false;
                    for (let x = -1; x <= 1; x++) {
                        for (let y = -1; y <= 1; y++) {
                            const newX = space.x + x;
                            const newY = space.y + y;
                            if (
                                this.roomPlan.get(newX, newY) ===
                                structureToNumber[STRUCTURE_ROAD]
                            ) {
                                hasRoad = true;
                                break;
                            }
                        }
                        if (hasRoad) {
                            break;
                        }
                    }

                    if (hasRoad) {
                        bestSpot = space;
                        break;
                    }
                }

                if (!bestSpot) {
                    console.log("Could not fit all extensions!");
                    break;
                }
                this.roomPlan.set(
                    bestSpot.x,
                    bestSpot.y,
                    structureToNumber[STRUCTURE_EXTENSION]
                );
                extensionPositions.push({ x: bestSpot.x, y: bestSpot.y });
            }

            // Next, we'll replace the extra extensions we placed above with towers

            // Start by creating floodfills for each exit
            const exitMatrices = [];
            for (const exitKey in Game.map.describeExits(roomInfo.room.name)) {
                const matrix = matrixUtility.floodfill(
                    roomInfo.room.find(exitKey),
                    terrainMatrix.clone()
                );
                exitMatrices.push(matrix);
            }

            // Then we'll circle through each exit and optimize a tower for that exit
            for (let i = 0; i < MAX_STRUCTURES[STRUCTURE_TOWER]; i++) {
                // Find the position of the planned extension with the lowest distance to the exit we've select
                const activeMatrix = exitMatrices[i % exitMatrices.length];
                const nextTowerPos = extensionPositions.reduce((best, curr) => {
                    return activeMatrix.get(curr.x, curr.y) <
                        activeMatrix.get(best.x, best.y)
                        ? curr
                        : best;
                });
                this.roomPlan.set(
                    nextTowerPos.x,
                    nextTowerPos.y,
                    structureToNumber[STRUCTURE_TOWER]
                );

                // Remove this position so we don't try to place a tower there again
                extensionPositions.splice(
                    extensionPositions.indexOf(nextTowerPos),
                    1
                );
            }

            // We'll also replace the worst extension with our observer
            const worstExtensionPos = extensionPositions.reduce(
                (worst, curr) => {
                    return weightMatrix.get(worst.x, worst.y) <
                        weightMatrix.get(curr.x, curr.y)
                        ? curr
                        : worst;
                }
            );
            this.roomPlan.set(
                worstExtensionPos.x,
                worstExtensionPos.y,
                structureToNumber[STRUCTURE_OBSERVER]
            );

            // Then finally, we'll filter out any structures we might have accidentally placed on walls
            // (through optional roads and things like that)
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                    if (terrainMatrix.get(x, y) > 0) {
                        this.roomPlan.set(x, y, 0);
                    }
                }
            }

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

    planRoads(connectPoints, roomName, corePos, roomPlan) {
        // Path from further points first
        connectPoints.sort(
            (a, b) =>
                b.pos.getRangeTo(corePos.x, corePos.y) -
                a.pos.getRangeTo(corePos.x, corePos.y)
        );

        // Save a path to each of our road points
        // Use a separate matrix for road positions and pathing locations
        const roadMatrix = new PathFinder.CostMatrix();
        const pathfindMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = roomPlan.get(x, y);
                pathfindMatrix.set(
                    x,
                    y,
                    value === structureToNumber[STRUCTURE_ROAD]
                        ? 1
                        : value === 0 ||
                          value === structureToNumber[EXCLUSION_ZONE]
                        ? 0
                        : MAX_VALUE
                );
            }
        }
        const goal = {
            pos: new RoomPosition(corePos.x, corePos.y, roomName),
            range: 2,
        };
        for (const point of connectPoints) {
            const result = PathFinder.search(point.pos, goal, {
                plainCost: 2,
                swampCost: 2,
                maxRooms: 1,
                roomCallback: function (roomName) {
                    return pathfindMatrix;
                },
            });

            // Save these into our road matrix
            for (const step of result.path) {
                pathfindMatrix.set(step.x, step.y, 1);
                roadMatrix.set(
                    step.x,
                    step.y,
                    structureToNumber[STRUCTURE_ROAD]
                );
            }

            if (point instanceof Source || point instanceof Mineral) {
                const lastStep = result.path[0];
                pathfindMatrix.set(lastStep.x, lastStep.y, MAX_VALUE);
                roadMatrix.set(
                    lastStep.x,
                    lastStep.y,
                    structureToNumber[STRUCTURE_CONTAINER]
                );
            }
        }
        return roadMatrix;
    }

    connectStragglingRoads(roomName, corePos, roomPlan) {
        // First, construct an array of all of our roads
        let allRoads = [];
        const roadMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (roomPlan.get(x, y) === structureToNumber[STRUCTURE_ROAD]) {
                    allRoads.push({ x, y });
                    roadMatrix.set(x, y, 1);
                    continue;
                }
                roadMatrix.set(x, y, 255);
            }
        }

        // Then, identify any roads that cannot connect back to the core
        const stragglingRoads = [];
        const maxNeededTiles = allRoads.length;
        const goal = {
            pos: new RoomPosition(corePos.x, corePos.y, roomName),
            range: 2,
        };
        while (allRoads.length) {
            const next = allRoads.pop();
            const result = PathFinder.search(
                new RoomPosition(next.x, next.y, roomName),
                goal,
                {
                    maxRooms: 1,
                    maxCost: maxNeededTiles,
                    roomCallback: function (roomName) {
                        return roadMatrix;
                    },
                }
            );

            // For each road we stepped over, remembering to include our start position
            for (const road of result.path.concat(next)) {
                // We can remove this road from our array since we know its state now
                allRoads = allRoads.filter(
                    (r) => r.x !== road.x || r.y !== road.y
                );

                // If it was incomplete, we know that this road
                // does not connect back to our core
                if (result.incomplete) {
                    stragglingRoads.push(road);
                }
            }
        }

        // Plan roads to connect these back to our core
        const roadPositions = stragglingRoads.map((r) => {
            return { pos: new RoomPosition(r.x, r.y, roomName) };
        });
        return this.planRoads(roadPositions, roomName, corePos, roomPlan);
    }

    planExitExclusionZones(roomInfo, corePos, roomPlan) {
        const exitTypes = [
            FIND_EXIT_TOP,
            FIND_EXIT_BOTTOM,
            FIND_EXIT_LEFT,
            FIND_EXIT_RIGHT,
        ];
        const roomTerrain = Game.map.getRoomTerrain(roomInfo.room.name);

        // Let's build a roadmatrix to encourage using existing roads
        const roadMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (roomTerrain.get(x, y) === TERRAIN_MASK_WALL) {
                    roadMatrix.set(x, y, MAX_VALUE);
                    continue;
                }
                if (roomTerrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                    roadMatrix.set(x, y, CONNECTIVE_ROAD_PENALTY_SWAMP);
                    continue;
                }
                if (roomPlan.get(x, y) === structureToNumber[STRUCTURE_ROAD]) {
                    roadMatrix.set(x, y, 1);
                    continue;
                }
                roadMatrix.set(x, y, CONNECTIVE_ROAD_PENALTY_PLAINS);
            }
        }

        // Let's make sure that we can path to each exit from our core
        corePos = new RoomPosition(corePos.x, corePos.y, roomInfo.room.name);
        for (const exitType of exitTypes) {
            const tiles = roomInfo.room.find(exitType);
            if (!tiles.length) {
                continue;
            }
            const goals = tiles.map((tile) => {
                return { pos: tile, range: MIN_BUILD_AREA - 1 };
            });

            const result = PathFinder.search(corePos, goals, {
                maxRooms: 1,
                roomCallback: function (roomName) {
                    return roadMatrix;
                },
            });
            if (!result.path.length) {
                continue;
            }

            // Encourage potential future remotes to combine paths as well
            for (const point of result.path) {
                roadMatrix.set(point.x, point.y, 1);
                if (this.roomPlan.get(point.x, point.y) === 0) {
                    roomPlan.set(
                        point.x,
                        point.y,
                        structureToNumber[EXCLUSION_ZONE]
                    );
                }
            }
        }
        return roomPlan;
    }
}

const stamps = {
    core: {
        layout: [
            [
                undefined,
                undefined,
                undefined,
                STRUCTURE_ROAD,
                undefined,
                undefined,
                undefined,
            ],
            [
                undefined,
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
                undefined,
            ],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_STORAGE,
                STRUCTURE_EXTENSION,
                STRUCTURE_SPAWN,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_TERMINAL,
                undefined,
                STRUCTURE_FACTORY,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                ,
            ],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_POWER_SPAWN,
                STRUCTURE_NUKER,
                STRUCTURE_LINK,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                undefined,
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
                undefined,
            ],
            [
                undefined,
                undefined,
                undefined,
                STRUCTURE_ROAD,
                undefined,
                undefined,
                undefined,
            ],
        ],
        // Points used for validating distances around this stamp to ensure
        // no overlap with each other or terrain
        // Relative to the top left corner
        distancePoints: [
            { x: 3, y: 3, range: 2 },
            { x: 3, y: 0, range: 0 },
            { x: 0, y: 3, range: 0 },
            { x: 6, y: 3, range: 0 },
            { x: 3, y: 6, range: 0 },
        ],
        // The center for placement
        // The stamp will be attempted to place with this tile on the lowest scoring weight
        center: { x: 3, y: 3 },
    },

    extensionStampX: {
        layout: [
            [undefined, undefined, STRUCTURE_ROAD, undefined, undefined],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_EXTENSION,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
            ],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
            ],
            [undefined, undefined, STRUCTURE_ROAD, undefined, undefined],
        ],
        distancePoints: [
            { x: 2, y: 1, range: 0 },
            { x: 1, y: 2, range: 0 },
            { x: 2, y: 2, range: 0 },
            { x: 3, y: 2, range: 0 },
            { x: 2, y: 3, range: 0 },
            { x: 1, y: 1, range: 0 },
            { x: 3, y: 3, range: 0 },
        ],
        center: { x: 2, y: 2 },
    },

    extensionStampXWithSpawn: {
        layout: [
            [undefined, undefined, STRUCTURE_ROAD, undefined, undefined],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_SPAWN,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
            ],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
            ],
            [undefined, undefined, STRUCTURE_ROAD, undefined, undefined],
        ],
        distancePoints: [
            { x: 2, y: 1, range: 0 },
            { x: 1, y: 2, range: 0 },
            { x: 2, y: 2, range: 0 },
            { x: 3, y: 2, range: 0 },
            { x: 2, y: 3, range: 0 },
            { x: 1, y: 1, range: 0 },
            { x: 3, y: 3, range: 0 },
        ],
        center: { x: 2, y: 2 },
    },

    labs: {
        layout: [
            [undefined, STRUCTURE_LAB, STRUCTURE_LAB, EXCLUSION_ZONE],
            [STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB],
            [STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB],
            [EXCLUSION_ZONE, STRUCTURE_LAB, STRUCTURE_LAB, undefined],
        ],
        distancePoints: [
            { x: 2, y: 1, range: 1 },
            { x: 1, y: 2, range: 1 },
        ],
        center: { x: 3, y: 0 },
    },
};

module.exports = BasePlanner;
