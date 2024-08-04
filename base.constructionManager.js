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
} = require("./constants");
const profiler = require("./debug.profiler");
const estimateTravelTime = require("./util.estimateTravelTime");
const { onRemoteDrop } = require("./event.colonyEvents");

const UTILITY_CONSTANTS = {
    [STRUCTURE_SPAWN]: 100,
    [STRUCTURE_EXTENSION]: 99,
    [STRUCTURE_CONTAINER]: 90,
    [STRUCTURE_LINK]: 80,
    [STRUCTURE_TOWER]: 51,
    [STRUCTURE_ROAD]: 50,
    [STRUCTURE_STORAGE]: 49,
    [STRUCTURE_RAMPART]: 48,
    [STRUCTURE_TERMINAL]: 40,
    [STRUCTURE_FACTORY]: 35,
};

const DEFENSE_THRESHOLD_TICKS = 1500;
const DEFENSE_UTILITY_BONUS = 200;

const MAX_SITES = 2;

const RESET_CACHE_INTERVAL = 50;

// We need a cache for each room
// Each cache will hold some information for expiry
// Cached RCL
// Cached Tick
// The array of missing structures when cache was created
const caches = {};

// When we drop a remote, let's reset our cache and filter out build targets that might be part of that remote
// while making sure to destroy sites associated with that target.
onRemoteDrop.subscribe((colony, remote) => {
    updateCache(colony, colony.room.controller.level);

    // Filter build targets that belong to this remote
    colony.memory.buildTargets = colony.memory.buildTargets.filter((b) => {
        const room = Game.rooms[b.pos.roomName];
        if (!room) return false;

        const site = room
            .getPositionAt(b.pos.x, b.pos.y)
            .lookFor(LOOK_CONSTRUCTION_SITES)[0];
        if (!site) return false;
        if (
            site.structureType === STRUCTURE_CONTAINER &&
            site.pos.x === remote.container.x &&
            site.pos.y === remote.container.y &&
            site.pos.roomName === remote.container.roomName
        ) {
            site.remove();
            return false;
        }

        // Roads are tougher, since we'll have to verify that this road
        // didn't belong to another one of our remotes
        for (const remote of colony.remotePlans) {
            if (!remote.active) continue;
            if (
                remote.roads.find(
                    (r) =>
                        r.x === site.pos.x &&
                        r.y === site.pos.y &&
                        r.roomName === site.pos.roomName
                )
            ) {
                return true;
            }
        }
        site.remove();
        return false;
    });
});

const handleSites = (colony) => {
    // Update our list of cached structures if it's been invalidated,
    // or every once and a while to account for structures potentially being destroyed and remotes changing
    const rcl = colony.room.controller.level;
    if (
        !caches[colony.room.name] ||
        caches[colony.room.name].rcl !== rcl ||
        caches[colony.room.name].tick + RESET_CACHE_INTERVAL < Game.time
    ) {
        updateCache(colony, rcl);
    }

    // We only care about the rest when we can place a site
    if (colony.constructionSites.length >= MAX_SITES) {
        return;
    }
    const cache = caches[colony.room.name];

    // Only allow sites in rooms we can see and aren't reserved by another player
    const validStructures = cache.missingStructures.filter((s) => {
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
        // Let's track when we've completed construction for this RCL
        // for some important things like hauler and miner part ratios
        colony.memory.constructionLevel = rcl;
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
        cache.missingStructures = cache.missingStructures.filter(
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
            "result from placing construction site at position " +
                JSON.stringify(bestStructure.pos) +
                " resulted in issue with code " +
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
    let missingStructures = wantedStructures.filter(
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

    if (rcl < REMOTE_ROAD_RCL) {
        createCache(colony, rcl, missingStructures);
        return;
    }

    // Don't forget remotes, if we have them
    for (const remote of colony.remotePlans) {
        if (!remote.active) {
            continue;
        }

        // Push all potential structures
        const missingRemoteStructures = [];
        if (rcl >= REMOTE_ROAD_RCL) {
            missingRemoteStructures.push(
                ...remote.roads
                    .filter((r) => {
                        const room = Game.rooms[r.roomName];
                        if (!room) return false;
                        return !room
                            .lookForAt(LOOK_STRUCTURES, r.x, r.y)
                            .concat(
                                room.lookForAt(
                                    LOOK_CONSTRUCTION_SITES,
                                    r.x,
                                    r.y
                                )
                            )
                            .find((f) => f.structureType === STRUCTURE_ROAD);
                    })
                    .map((road) => {
                        return {
                            type: STRUCTURE_ROAD,
                            pos: new RoomPosition(
                                road.x,
                                road.y,
                                road.roomName
                            ),
                        };
                    })
            );
        }

        // Finally let's add this to our list of needed structures
        missingStructures = missingStructures.concat(missingRemoteStructures);
    }

    // Cache this so our work is meaningful
    createCache(colony, rcl, missingStructures);
};

const createCache = (colony, rcl, missingStructures) => {
    caches[colony.room.name] = {
        tick: Game.time,
        rcl,
        missingStructures,
    };
};

const scoreUtility = (colony, structure) => {
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
