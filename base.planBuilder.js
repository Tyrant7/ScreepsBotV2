const stampUtility = require("./base.stampUtility");
const matrixUtility = require("./base.matrixUtility");
const utility = require("./base.planningUtility");
const {
    MAX_VALUE,
    MAX_BUILD_AREA,
    MIN_BUILD_AREA,
    EXCLUSION_ZONE,
    structureToNumber,
} = require("./base.planningConstants");

const MAX_STAMP_ATTEMPTS = 20;
const RAMPART_GAP = 3;

const CONNECTIVE_ROAD_PENALTY_PLAINS = 3;
const CONNECTIVE_ROAD_PENALTY_SWAMP = 5;

const MAX_STRUCTURES = {};
for (const key in CONTROLLER_STRUCTURES) {
    MAX_STRUCTURES[key] = parseInt(
        Object.values(CONTROLLER_STRUCTURES[key]).slice(-1)
    );
}

class PlanBuilder {
    constructor(
        terrainMatrix,
        distanceTransform,
        weightMatrix,
        coreStamp,
        roomInfo
    ) {
        // Initialize a new room plan
        this.roomPlan = new PathFinder.CostMatrix();
        this.ramparts = new PathFinder.CostMatrix();

        // Store necessary planning matrices
        this.tm = terrainMatrix;
        this.dt = distanceTransform;
        this.wm = weightMatrix;

        // Let's sort all possible build spaces by score
        this.spaces = [];
        for (let x = MIN_BUILD_AREA; x < MAX_BUILD_AREA; x++) {
            for (let y = MIN_BUILD_AREA; y < MAX_BUILD_AREA; y++) {
                if (this.tm.get(x, y) === 0) {
                    this.spaces.push({ x, y });
                }
            }
        }
        this.spaces.sort(
            (a, b) => this.wm.get(a.x, a.y) - this.wm.get(b.x, b.y)
        );

        // Let's start by doing a simple placement of our core on the best space we can find that fits it
        const core = this.placeStamp(coreStamp);
        this.corePos = new RoomPosition(core.x, core.y, roomInfo.room.name);

        this.floodfillFromCore = matrixUtility.floodfill(
            this.corePos,
            terrainMatrix.clone()
        );

        this.ri = roomInfo;

        // Initialize these necessary road planning variables
        this.upgraderContainer = undefined;
        this.mineralContainer = undefined;
        this.sourceContainers = [];
    }

    /**
     * Plans the upgrader container for this room.
     * @returns {{ x: number, y: number }} The X and Y position chosen for the container.
     */
    planUpgraderContainer() {
        const controllerPos = this.ri.room.controller.pos;

        // Find the position near our controller with the most open spaces,
        // using distance to our core as a tiebreaker
        let bestContainerSpot;
        let bestOpenSpaces = 0;
        let bestDist = Infinity;
        for (let x = -2; x <= 2; x++) {
            for (let y = -2; y <= 2; y++) {
                const newX = controllerPos.x + x;
                const newY = controllerPos.y + y;
                if (!utility.inBuildArea(newX, newY)) {
                    continue;
                }
                if (
                    this.tm.get(newX, newY) !== 0 ||
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
                        if (!utility.inBuildArea(newX, newY)) {
                            continue;
                        }
                        if (
                            this.tm.get(neighbourX, neighbourY) !== 0 ||
                            this.roomPlan.get(neighbourX, neighbourY) !== 0
                        ) {
                            continue;
                        }
                        openSpaces++;
                    }
                }

                const dist = this.floodfillFromCore.get(newX, newY);
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
        this.upgraderContainer = bestContainerSpot;
    }

    /**
     * Locates the mineral in this room and plans an extractor there.
     */
    planExtractor() {
        if (this.ri.mineral) {
            this.roomPlan.set(
                this.ri.mineral.pos.x,
                this.ri.mineral.pos.y,
                structureToNumber[STRUCTURE_EXTRACTOR]
            );
        }
    }

    /**
     * Resorts the buildable spaces based on the given compare function.
     * @param {(a: { x: number, y: number },
     *          b: { x: number, y: number }) => number} compareFn A function returning a number
     * to use for sort order. A negative number indicates a before b, and a positive indicates b before a.
     */
    resortSpaces(compareFn) {
        this.spaces.sort(compareFn);
    }

    /**
     * Filters current buildable spaces where a structure already exists in the room plan, or where
     * structures will not be accessible if placed.
     */
    filterUsedSpaces() {
        const unwalkableMatrix = new PathFinder.CostMatrix();
        const excludeStructures = [
            0,
            structureToNumber[EXCLUSION_ZONE],
            structureToNumber[STRUCTURE_CONTAINER],
            structureToNumber[STRUCTURE_ROAD],
        ];
        matrixUtility.iterateMatrix((x, y) => {
            const s = this.roomPlan.get(x, y);
            if (excludeStructures.includes(s)) {
                return;
            }
            unwalkableMatrix.set(x, y, MAX_VALUE);
        });
        const fill = matrixUtility.floodfill(
            this.ri.room.find(FIND_EXIT),
            matrixUtility.combineMatrices(this.tm, unwalkableMatrix)
        );

        this.spaces = this.spaces.filter(
            (space) =>
                // Filter out all used spaces
                this.roomPlan.get(space.x, space.y) === 0 &&
                // And inaccessible spaces
                fill.get(space.x, space.y) !== 0
        );
    }

    /**
     * Gets a path from the core to each of the connect points.
     * @param {{ pos: RoomPosition }[]} connectPoints An array of objects with a `pos` property of type `RoomPosition`.
     * Will path from these positions back to the core.
     * @returns {{ point: { x: number, y: number }, path: RoomPosition[]}}
     * An object with two properties. The first being the point which the path belongs to,
     * and the second being an array of `RoomPosition`s marking the path.
     */
    getRoadPaths(connectPoints) {
        // Path from further points first
        connectPoints.sort(
            (a, b) =>
                b.pos.getRangeTo(this.corePos.x, this.corePos.y) -
                a.pos.getRangeTo(this.corePos.x, this.corePos.y)
        );

        // Save a path to each of our road points
        const pathfindMatrix = new PathFinder.CostMatrix();
        matrixUtility.iterateMatrix((x, y) => {
            const value = this.roomPlan.get(x, y);
            pathfindMatrix.set(
                x,
                y,
                value === structureToNumber[STRUCTURE_ROAD]
                    ? 1
                    : value === 0 || value === structureToNumber[EXCLUSION_ZONE]
                    ? 0
                    : MAX_VALUE
            );
        });
        const goal = {
            pos: this.corePos,
            range: 2,
        };
        const allPoints = [];
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
            }
            allPoints.push({ point: point, path: result.path });
        }
        return allPoints;
    }

    /**
     * Plans containers for mineral and containers + link for sources.
     * Does so by gauging the approximate road plans, and placing containers/links at the end.
     */
    planMiningSpots() {
        const spots = [].concat(this.ri.sources).concat(this.ri.mineral);
        const paths = this.getRoadPaths(spots);
        for (const { point, path } of paths) {
            // Place the containers
            const lastStep = path[0];
            this.roomPlan.set(
                lastStep.x,
                lastStep.y,
                structureToNumber[STRUCTURE_CONTAINER]
            );

            if (point instanceof Source) {
                this.sourceContainers.push(lastStep);
            } else {
                this.mineralContainer = lastStep;
                continue;
            }

            // Handle link placement
            // Iterate the neighbours, then choose the one
            // closest to the core where no other structure lies
            let bestNeighbour;
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const newX = lastStep.x + x;
                    const newY = lastStep.y + y;
                    if (newX >= 48 || newX <= 1 || newY >= 48 || newY <= 1) {
                        continue;
                    }
                    if (
                        this.tm.get(newX, newY) ||
                        this.roomPlan.get(newX, newY)
                    ) {
                        continue;
                    }
                    if (
                        !bestNeighbour ||
                        this.floodfillFromCore.get(
                            bestNeighbour.x,
                            bestNeighbour.y
                        ) > this.floodfillFromCore.get(newX, newY)
                    ) {
                        bestNeighbour = { x: newX, y: newY };
                    }
                }
            }
            this.roomPlan.set(
                bestNeighbour.x,
                bestNeighbour.y,
                structureToNumber[STRUCTURE_LINK]
            );
        }
    }

    /**
     * Plans artery roads for this base by default.
     * These are roads which connect all source, mineral, and upgrader containers back to the core.
     * If supplied with connect points, will connect those back to the core instead.
     * @param {{ x: number, y: number }[]} points An array of points to map back to the core.
     * By default, all source, mineral, and upgrader containers currently planned.
     */
    planRoads(points = undefined) {
        if (!points) {
            points = []
                .concat(this.sourceContainers)
                .concat(this.mineralContainer)
                .concat(this.upgraderContainer);
        }
        points = points.filter((p) => p);
        points = points.map((point) => {
            return {
                pos: this.ri.room.getPositionAt(point.x, point.y),
            };
        });
        const paths = this.getRoadPaths(points);
        for (const { path } of paths) {
            // Save these into our road matrix
            for (const step of path) {
                this.roomPlan.set(
                    step.x,
                    step.y,
                    structureToNumber[STRUCTURE_ROAD]
                );
            }
        }
    }

    /**
     * Ensures all roads in the current plan connect back to the core.
     * If not already, will draw connecting roads where possible.
     * Will also remove any invalid road tiles that may have been previously placed.
     */
    connectStragglingRoads() {
        // First cleanup any roads placed over terrain
        this.cleanup();

        // First, construct an array of all of our roads
        let allRoads = [];
        const roadMatrix = new PathFinder.CostMatrix();
        matrixUtility.iterateMatrix((x, y) => {
            if (this.roomPlan.get(x, y) === structureToNumber[STRUCTURE_ROAD]) {
                allRoads.push({ x, y });
                roadMatrix.set(x, y, 1);
                return;
            }
            roadMatrix.set(x, y, 255);
        });

        // Then, identify any roads that cannot connect back to the core
        const stragglingRoads = [];
        const maxNeededTiles = allRoads.length;
        const goal = {
            pos: this.corePos,
            range: 2,
        };
        while (allRoads.length) {
            const next = allRoads.pop();
            const result = PathFinder.search(
                new RoomPosition(next.x, next.y, this.ri.room.name),
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
        this.planRoads(stragglingRoads);
    }

    /**
     * Places exclusion zones to ensure that there is at least one valid path
     * to each exit of the current planning room.
     */
    planRemoteRoads() {
        const exitTypes = [
            FIND_EXIT_TOP,
            FIND_EXIT_BOTTOM,
            FIND_EXIT_LEFT,
            FIND_EXIT_RIGHT,
        ];
        const roomTerrain = Game.map.getRoomTerrain(this.ri.room.name);

        // Let's build a roadmatrix to encourage using existing roads
        const roadMatrix = new PathFinder.CostMatrix();
        matrixUtility.iterateMatrix((x, y) => {
            if (roomTerrain.get(x, y) === TERRAIN_MASK_WALL) {
                roadMatrix.set(x, y, MAX_VALUE);
                return;
            }
            if (this.roomPlan.get(x, y) === structureToNumber[STRUCTURE_ROAD]) {
                roadMatrix.set(x, y, 1);
                return;
            }
            if (roomTerrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                roadMatrix.set(x, y, CONNECTIVE_ROAD_PENALTY_SWAMP);
                return;
            }
            roadMatrix.set(x, y, CONNECTIVE_ROAD_PENALTY_PLAINS);
        });

        // Let's make sure that we can path to each exit from our core
        for (const exitType of exitTypes) {
            const tiles = this.ri.room.find(exitType);
            if (!tiles.length) {
                continue;
            }
            const goals = tiles.map((tile) => {
                return { pos: tile, range: MIN_BUILD_AREA - 1 };
            });

            const result = PathFinder.search(this.corePos, goals, {
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
                    this.roomPlan.set(
                        point.x,
                        point.y,
                        structureToNumber[EXCLUSION_ZONE]
                    );
                }
            }
        }
    }

    /**
     * Places a stamp in the best position found after `MAX_STAMP_ATTEMPTS` attempts, where
     * best is defined as sharing the most number of roads with existing roads in the plan.
     * @param {{}} stamp The stamp to place.
     * @returns {{ x: number, y: number }} The centre position of the placed stamp.
     */
    placeStamp(stamp) {
        let attempts = 0;
        let foundOne = false;

        let bestScore = Infinity;
        let bestStamp;
        let bestStampPos;

        // Find the best stamp we can place currently over an arbitrary number of attempts
        for (const space of this.spaces) {
            if (attempts >= MAX_STAMP_ATTEMPTS) {
                break;
            }

            // Consider all orientations
            for (const transform of stampUtility.getTransformationList()) {
                const transformedStamp = transform(stamp);
                if (
                    stampUtility.stampFits(
                        transformedStamp,
                        space,
                        this.dt,
                        this.roomPlan
                    )
                ) {
                    // We'll score the stamp based on how many roads its placement managed to save
                    // Lower scores are better
                    let score = 0;
                    const dummyPlan = stampUtility.placeStamp(
                        transformedStamp,
                        space,
                        this.roomPlan.clone()
                    );
                    matrixUtility.iterateMatrix((x, y) => {
                        if (
                            dummyPlan.get(x, y) ===
                            structureToNumber[STRUCTURE_ROAD]
                        ) {
                            score++;
                        }
                    });

                    // Once we've found the an orientation that fits, let's save it
                    // if it beats our current best
                    if (!bestStamp || bestScore > score) {
                        bestScore = score;
                        bestStamp = transformedStamp;
                        bestStampPos = space;
                    }

                    foundOne = true;
                }
            }

            if (foundOne) {
                attempts++;
            }
        }

        if (bestStamp) {
            this.roomPlan = stampUtility.placeStamp(
                bestStamp,
                bestStampPos,
                this.roomPlan
            );
        }
        return bestStampPos;
    }

    /**
     * Places multiple of the same stamp by calling `placeStamp` once for each `count`.
     * Also employs an optimization to filter out used spaces before attempting stamp placement.
     * @param {{}} stamp The stamp to place.
     * @param {number} count The number of stamps to place.
     */
    placeStamps(stamp, count) {
        this.filterUsedSpaces();
        for (let i = 0; i < count; i++) {
            this.placeStamp(stamp);
        }
    }

    /**
     * Handles placement of all dynamic structures of the plan.
     * Any missing extensions will be placed here, as well towers, and the observer.
     */
    placeDynamicStructures() {
        // Next, we'll place our remaining extensions, we'll plan extra for tower and observer placement positions later
        // Let's start by counting how many extensions we have already
        let placedExtensions = 0;
        matrixUtility.iterateMatrix((x, y) => {
            if (
                this.roomPlan.get(x, y) ===
                structureToNumber[STRUCTURE_EXTENSION]
            ) {
                placedExtensions++;
            }
        });

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
            for (const space of this.spaces) {
                if (
                    this.tm.get(space.x, space.y) !== 0 ||
                    this.roomPlan.get(space.x, space.y) !== 0
                ) {
                    continue;
                }
                if (!utility.inBuildArea(space.x, space.y)) {
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
                console.log("Could not fit all structures!");
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
        for (const exitKey in Game.map.describeExits(this.ri.room.name)) {
            const matrix = matrixUtility.floodfill(
                this.ri.room.find(exitKey),
                this.tm.clone()
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
        const worstExtensionPos = extensionPositions.reduce((worst, curr) => {
            return this.wm.get(worst.x, worst.y) < this.wm.get(curr.x, curr.y)
                ? curr
                : worst;
        });
        this.roomPlan.set(
            worstExtensionPos.x,
            worstExtensionPos.y,
            structureToNumber[STRUCTURE_OBSERVER]
        );
    }

    /**
     * Uses Clarkok's mincut implementation to protect the base in the fewest number of ramparts.
     * Also places ramparts over any important exposed structures, like links.
     */
    planRamparts() {
        const { minCutToExit } = require("./base.mincut");

        // First let's figure out where all of our important structures are
        const excludedStructures = [
            0,
            structureToNumber[EXCLUSION_ZONE],
            structureToNumber[STRUCTURE_ROAD],
            structureToNumber[STRUCTURE_LINK],
            structureToNumber[STRUCTURE_CONTAINER],
            structureToNumber[STRUCTURE_EXTRACTOR],
        ];
        const structures = [];
        matrixUtility.iterateMatrix((x, y) => {
            if (!excludedStructures.includes(this.roomPlan.get(x, y))) {
                structures.push({ x, y });
            }
        });

        // Then, we'll figure out everywhere we want to protect with ramparts
        // In this case, it's any tile within ATTACK_RANGE of our structures
        const flood = matrixUtility.floodfill(
            structures,
            new PathFinder.CostMatrix()
        );
        const sources = [];
        matrixUtility.iterateMatrix((x, y) => {
            if (flood.get(x, y) <= RAMPART_GAP) {
                sources.push({ x, y });
            }
        });

        // Then we'll create the matrix of costs to cut
        const cutCosts = new PathFinder.CostMatrix();
        matrixUtility.iterateMatrix((x, y) => {
            if (this.tm.get(x, y)) {
                cutCosts.set(x, y, MAX_VALUE);
                return;
            }
            cutCosts.set(x, y, 1);
        });

        // Finally, we'll perform our mincut and set our base ramparts in our cost matrix
        const ramparts = minCutToExit(sources, cutCosts);
        this.ramparts = new PathFinder.CostMatrix();
        for (const rampart of ramparts) {
            if (this.tm.get(rampart.x, rampart.y)) {
                continue;
            }
            this.ramparts.set(rampart.x, rampart.y, MAX_VALUE);
        }

        // After doing our main ramparts, let's look for any important structures outside of them,
        // and place a rampart there as well
        const exit = this.ri.room.find(FIND_EXIT)[0];
        const fillFromExit = matrixUtility.floodfill(
            exit,
            matrixUtility.combineMatrices(this.tm, this.ramparts)
        );
        const importantStructures = [structureToNumber[STRUCTURE_LINK]];
        matrixUtility.iterateMatrix((x, y) => {
            if (
                fillFromExit.get(x, y) &&
                importantStructures.includes(this.roomPlan.get(x, y))
            ) {
                this.ramparts.set(x, y, MAX_VALUE);
            }
        });
    }

    /**
     * Removes any structures overlapping with terrain in the current plan.
     */
    cleanup() {
        // Filter out any structures we might have accidentally placed on walls
        // through optional roads and things like that
        matrixUtility.iterateMatrix((x, y) => {
            if (this.tm.get(x, y) > 0) {
                if (
                    this.roomPlan.get(x, y) ===
                    structureToNumber[STRUCTURE_EXTRACTOR]
                ) {
                    return;
                }
                this.roomPlan.set(x, y, 0);
            }
        });
    }

    /**
     * Gets the current plan.
     * @returns {{ structures: PathFinder.CostMatrix, ramparts: PathFinder.CostMatrix }}
     * The current room plan. `structures` represents all structures except ramparts, while `ramparts` is only ramparts.
     */
    getProduct() {
        return { structures: this.roomPlan, ramparts: this.ramparts };
    }
}

module.exports = PlanBuilder;
