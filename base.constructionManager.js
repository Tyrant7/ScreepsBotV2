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
    REMOTE_ROAD_RCL,
    REMOTE_CONTAINER_RCL,
} = require("./constants");
const profiler = require("./debug.profiler");
const estimateTravelTime = require("./util.estimateTravelTime");

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
let cachedTick = -RESET_CACHE_INTERVAL;
let cachedMissingStructures = [];

const handleSites = (colony) => {
    // Update our list of cached structures if it's been invalidated,
    // or every once and a while to account for structures potentially being destroyed and remotes changing
    const rcl = colony.room.controller.level;
    if (
        !cachedMissingStructures ||
        cachedRCL !== rcl ||
        cachedTick + RESET_CACHE_INTERVAL < Game.time
    ) {
        updateCache(colony, rcl);
    }

    // We only care about the rest when we can place a site
    if (colony.constructionSites.length >= MAX_SITES) {
        return;
    }

    // Only allow sites in rooms we can see and aren't reserved by another player
    const validStructures = cachedMissingStructures.filter((s) => {
        // Any rooms owned or reserved by somebody that isn't me won't allow construction
        const room = Game.rooms[s.pos.roomName];
        if (!room) return false;
        if (!room.controller) return true;
        if (room.controller.owner && room.controller.owner.username !== ME)
            return false;
        if (
            room.controller.reservation &&
            room.controller.reservation.username !== ME
        )
            return false;
        return true;
    });
    if (!validStructures.length) {
        return;
    }

    // Next, once we have all unbuilt sites, let's get the one with the highest utility value
    // Utility will be scored based on some constants
    profiler.startSample("best structure");
    const bestStructure =
        validStructures.length > 1
            ? validStructures.reduce((best, curr) => {
                  if (best.score === undefined) {
                      best = {
                          score: scoreUtility(colony, best),
                          structure: best,
                      };
                  }

                  const currScore = scoreUtility(colony, curr);

                  // If the two candidates have the same score, we'll rank them by distance instead
                  if (currScore === best.score) {
                      const buildTargets = colony.memory.buildTargets;
                      if (buildTargets && buildTargets.length) {
                          const next = buildTargets[buildTargets.length - 1];
                          const nextPos = new RoomPosition(
                              next.pos.x,
                              next.pos.y,
                              next.pos.roomName
                          );
                          const bestDist = estimateTravelTime(
                              best.structure.pos,
                              nextPos
                          );
                          const currDist = estimateTravelTime(
                              curr.pos,
                              nextPos
                          );
                          return currDist < bestDist
                              ? { score: currScore, structure: curr }
                              : best;
                      }
                  }

                  // Otherwise there's a clear winner in utility
                  return currScore > best.score
                      ? { score: currScore, structure: curr }
                      : best;
              }).structure
            : validStructures[0];

    const result = new RoomPosition(
        bestStructure.pos.x,
        bestStructure.pos.y,
        bestStructure.pos.roomName
    ).createConstructionSite(bestStructure.type);
    profiler.endSample("best structure");
    profiler.startSample("update costmatrix");
    if (result === OK) {
        // If it went through, let's remove it from the structures we want
        cachedMissingStructures = cachedMissingStructures.filter(
            (s) => s !== bestStructure
        );

        // Let's also set it as our current build target for the room
        if (!colony.memory.buildTargets) {
            colony.memory.buildTargets = [];
        }
        // We should mark down the tick the site will be placed so we don't mistakenly remove it this tick
        // thinking it's already been constructed
        colony.memory.buildTargets.push({
            pos: bestStructure.pos,
            tick: Game.time + 1,
        });

        // Let's also update our cost matrix for creeps using our better pathing system
        const roomMatrix =
            getCachedPathMatrix(pathSets.default, bestStructure.pos.roomName) ||
            generateDefaultPathMatrix(bestStructure.pos.roomName);

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
        cachePathMatrix(
            roomMatrix,
            pathSets.default,
            bestStructure.pos.roomName
        );
    } else {
        console.log(
            "result from placing construction site resulted in issue with code " +
                result
        );
    }
    profiler.endSample("update costmatrix");
};

const updateCache = (colony, rcl) => {
    const plans = getPlan(colony.room.name);
    if (!plans) {
        return;
    }

    cachedRCL = rcl;
    cachedTick = Game.time;
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
                pos: colony.room.getPositionAt(x, y),
            });
        }
        if (ramparts.get(x, y)) {
            wantedStructures.push({
                type: STRUCTURE_RAMPART,
                pos: colony.room.getPositionAt(x, y),
            });
        }
    });

    // Find the ones we haven't already
    profiler.startSample("filter list");
    cachedMissingStructures = wantedStructures.filter(
        (s) =>
            !colony.room
                .lookForAt(LOOK_STRUCTURES, s.pos.x, s.pos.y)
                .concat(
                    colony.room.lookForAt(
                        LOOK_CONSTRUCTION_SITES,
                        s.pos.x,
                        s.pos.y
                    )
                )
                .find((t) => t.structureType === s.type)
    );
    profiler.endSample("filter list");
    profiler.endSample("structure list");

    // Don't forget remotes!
    if (rcl < REMOTE_ROAD_RCL && rcl < REMOTE_CONTAINER_RCL) {
        return;
    }
    for (const remote of colony.remotePlans) {
        if (!remote.active) {
            continue;
        }

        // Push all potential structures
        const wantedRemoteStructures = [];
        if (rcl >= REMOTE_ROAD_RCL) {
            wantedRemoteStructures.push(
                ...remote.roads.map((road) => {
                    return {
                        type: STRUCTURE_ROAD,
                        pos: new RoomPosition(road.x, road.y, road.roomName),
                    };
                })
            );
        }
        if (rcl >= REMOTE_CONTAINER_RCL) {
            wantedRemoteStructures.push({
                type: STRUCTURE_CONTAINER,
                pos: new RoomPosition(
                    remote.container.x,
                    remote.container.y,
                    remote.container.roomName
                ),
            });
        }

        // Then filter out already-built ones
        const missingRemoteStructures = wantedRemoteStructures.filter((s) => {
            const room = Game.rooms[s.pos.roomName];
            if (!room) {
                return false;
            }
            const existingStructure = room
                .lookForAt(LOOK_STRUCTURES, s.pos.x, s.pos.y)
                .concat(
                    room.lookForAt(LOOK_CONSTRUCTION_SITES, s.pos.x, s.pos.y)
                )
                .find((f) => f.structureType === s.type);
            return !existingStructure;
        });

        // Finally let's add this to our list of needed structures
        cachedMissingStructures = cachedMissingStructures.concat(
            missingRemoteStructures
        );
    }
};

const scoreUtility = (colony, structure, buildTargets) => {
    const baseUtility = UTILITY_CONSTANTS[structure.type] || 1;
    const isDefensive =
        structure.type === STRUCTURE_RAMPART ||
        structure.type === STRUCTURE_TOWER ||
        structure.type === STRUCTURE_WALL;
    if (
        isDefensive &&
        (!colony.room.safeMode ||
            colony.room.safeMode <= DEFENSE_THRESHOLD_TICKS)
    ) {
        return baseUtility + DEFENSE_UTILITY_BONUS;
    }
    return baseUtility;
};

module.exports = { handleSites };
