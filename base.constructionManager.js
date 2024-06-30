const { iterateMatrix } = require("./base.matrixUtility");
const { numberToStructure, MAX_VALUE } = require("./base.planningConstants");
const { getPlan } = require("./base.planningUtility");
const { deserializeBasePlan } = require("./base.serializeBasePlan");
const {
    getCachedPathMatrix,
    generateDefaultPathMatrix,
    cachePathMatrix,
} = require("./extension.betterPathing");
const {
    pathSets,
    CONTAINER_PATHING_COST,
    ROAD_PATHING_COST,
} = require("./constants");
const profiler = require("./debug.profiler");

const UTILITY_CONSTANTS = {
    [STRUCTURE_SPAWN]: 100,
    [STRUCTURE_EXTENSION]: 99,
    [STRUCTURE_STORAGE]: 95,
    [STRUCTURE_CONTAINER]: 90,
    [STRUCTURE_LINK]: 80,
    [STRUCTURE_TOWER]: 51,
    [STRUCTURE_RAMPART]: 50,
    [STRUCTURE_ROAD]: 49,
    [STRUCTURE_TERMINAL]: 40,
    [STRUCTURE_FACTORY]: 35,
};

const DEFENSE_THRESHOLD_TICKS = 1500;
const DEFENSE_UTILITY_BONUS = 200;

const MAX_SITES = 2;

const RESET_CACHE_INTERVAL = 50;

let cachedRCL = -1;
let cachedMissingStructures = [];

const handleSites = (roomInfo) => {
    if (roomInfo.constructionSites.length >= MAX_SITES) {
        return;
    }
    const plans = getPlan(roomInfo.room.name);
    if (!plans) {
        return;
    }

    // Update our list of cached structures if it's been invalidated,
    // or every once and a while to account for structures potentially being destroyed
    const rcl = roomInfo.room.controller.level;
    if (
        !cachedMissingStructures ||
        cachedRCL !== rcl ||
        Game.time % RESET_CACHE_INTERVAL === 0
    ) {
        const { structures, ramparts } = profiler.wrap("deserialize", () =>
            deserializeBasePlan(plans, rcl)
        );

        // Figure out all structures we want to build
        profiler.startSample("structure list");
        const wantedStructures = [];
        iterateMatrix((x, y) => {
            const structure = structures.get(x, y);
            if (structure) {
                wantedStructures.push({
                    type: numberToStructure[structure],
                    pos: { x, y },
                });
            }
            if (ramparts.get(x, y)) {
                wantedStructures.push({
                    type: STRUCTURE_RAMPART,
                    pos: { x, y },
                });
            }
        });

        // Find the ones we haven't already
        profiler.startSample("filter list");
        cachedMissingStructures = wantedStructures.filter(
            (s) =>
                !roomInfo.room
                    .lookForAt(LOOK_STRUCTURES, s.pos.x, s.pos.y)
                    .concat(
                        roomInfo.room.lookForAt(
                            LOOK_CONSTRUCTION_SITES,
                            s.pos.x,
                            s.pos.y
                        )
                    )
                    .find((t) => t.structureType === s.type)
        );
        profiler.endSample("filter list");

        cachedRCL = rcl;
        profiler.endSample("structure list");
    }

    if (!cachedMissingStructures.length) {
        return;
    }

    // Next, once we have all unbuilt sites, let's get the one with the highest utility value
    // Utility will be scored based on some constants
    profiler.startSample("best structure");
    const bestStructure =
        cachedMissingStructures.length > 1
            ? cachedMissingStructures.reduce((best, curr) => {
                  if (best.score === undefined) {
                      best = {
                          score: scoreUtility(roomInfo, best),
                          structure: best,
                      };
                  }
                  const currScore = scoreUtility(roomInfo, curr);
                  return currScore > best.score
                      ? { score: currScore, structure: curr }
                      : best;
              }).structure
            : cachedMissingStructures[0];

    const result = roomInfo.room
        .getPositionAt(bestStructure.pos.x, bestStructure.pos.y)
        .createConstructionSite(bestStructure.type);
    profiler.endSample("best structure");

    profiler.startSample("update costmatrix");
    if (result === OK) {
        // If it went through, let's remove it from the structures we want
        cachedMissingStructures.splice(
            cachedMissingStructures.indexOf(bestStructure),
            1
        );

        // Let's also update our cost matrix for creeps using our better pathing system
        const roomMatrix =
            getCachedPathMatrix(pathSets.default, roomInfo.room.name) ||
            generateDefaultPathMatrix(roomInfo.room.name);

        if (bestStructure.type === STRUCTURE_ROAD) {
            roomMatrix.set(
                bestStructure.pos.x,
                bestStructure.pos.y,
                ROAD_PATHING_COST
            );
        } else if (bestStructure.type === STRUCTURE_CONTAINER) {
            roomMatrix.set(
                bestStructure.pos.x,
                bestStructure.pos.y,
                CONTAINER_PATHING_COST
            );
        } else if (OBSTACLE_OBJECT_TYPES.includes(bestStructure.type)) {
            roomMatrix.set(bestStructure.pos.x, bestStructure.pos.y, MAX_VALUE);
        }

        // Now cache it
        cachePathMatrix(roomMatrix, pathSets.default, roomInfo.room.name);
    } else {
        console.log(
            "result from placing construction site resulted in issue with code " +
                result
        );
    }
    profiler.endSample("update costmatrix");
};

const scoreUtility = (roomInfo, structure) => {
    const baseUtility = UTILITY_CONSTANTS[structure.type] || 1;
    const isDefensive =
        structure.type === STRUCTURE_RAMPART ||
        structure.type === STRUCTURE_TOWER ||
        structure.type === STRUCTURE_WALL;
    if (
        isDefensive &&
        (!roomInfo.room.safeMode ||
            roomInfo.room.safeMode <= DEFENSE_THRESHOLD_TICKS)
    ) {
        return baseUtility + DEFENSE_UTILITY_BONUS;
    }
    return baseUtility;
};

module.exports = { handleSites };
