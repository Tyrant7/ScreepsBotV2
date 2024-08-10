const {
    roles,
    REMOTE_ROAD_RCL,
    REMOTE_CONTAINER_RCL,
    storageThresholds,
} = require("./constants");
const { getCost } = require("./spawn.spawnUtility");
const creepMaker = require("./spawn.creepMaker");

//#region Utility

const calculateMinEnergy = (colony) =>
    colony.miners.length && colony.haulers.length
        ? colony.room.energyCapacityAvailable
        : SPAWN_ENERGY_START;

//#endregion

//#region Types

/**
 * @typedef SpawnRequest An object with a creep body, name, and initial memory for the newly planned creep.
 * @property {BodyPartConstant[]} body The body parts for the new creep.
 * @property {string} name The name of the new creep.
 * @property {{ role: string }} memory An object with any data needed to initialize the creep. Strongly recommend
 * to include the creep's role.
 */

//#endregion

//#region Groups

const production = {
    [roles.cleaner]: (colony, count) => {
        // Using / 2 to denote an arbitrary ratio of cleaners to cores
        if (count >= colony.invaderCores.length / 2) return;
        return creepMaker.makeCleaner(colony.room.energyCapacityAvailable);
    },
    [roles.reserver]: (colony, count) => {
        const remotesRoomsBeingMined = colony.remoteRooms.filter((r) =>
            colony.miners.find(
                (m) =>
                    m.memory.miningSite &&
                    m.memory.miningSite.pos.roomName === r
            )
        );
        if (count >= remotesRoomsBeingMined.length) return;
        return creepMaker.makeReserver();
    },
    [roles.miner]: (colony, count) => {
        if (!colony.getFirstOpenMiningSite()) return;
        return creepMaker.makeMiner(
            calculateMinEnergy(colony),
            colony.room.controller.level >= REMOTE_CONTAINER_RCL
        );
    },
};

const transport = {
    [roles.hauler]: (colony, count) => {
        if (
            count === 0 &&
            colony.starterHaulers.length === 0 &&
            colony.room.controller.level === 1
        ) {
            // If we're just starting out, we'll make a special small hauler
            // that will become a scout in the future
            return creepMaker.makeStarterHauler();
        }

        // Don't spawn a hauler if we have idle haulers
        const hasIdleHauler = colony.haulers.find(
            (hauler) => hauler.memory.idle
        );
        if (hasIdleHauler) return;

        return creepMaker.makeHauler(
            calculateMinEnergy(colony),
            colony.memory.constructionLevel >= REMOTE_ROAD_RCL ? 2 : 1
        );
    },
};

const usage = {
    [roles.repairer]: (colony, count) => {
        if (!colony.remotesNeedingRepair.length || count > 0) return;
        return creepMaker.makeRepairer(colony.room.energyCapacityAvailable);
    },
    [roles.scout]: (colony, count) => {
        if (count > 0) return;
        return creepMaker.makeScout();
    },
    [roles.builder]: (colony, count) => {
        if (!colony.memory.buildTargets.length || count >= 2) return;
        return creepMaker.makeBuilder(colony.room.energyCapacityAvailable);
    },
    [roles.mineralMiner]: (colony, count) => {
        if (count > 0 || !colony.structures[STRUCTURE_EXTRACTOR]) return;
        return creepMaker.makeMineralMiner(colony.room.energyCapacityAvailable);
    },
    [roles.upgrader]: (colony, count) => {
        // Always try to have at least one upgrader
        if (count <= 0)
            return creepMaker.makeUpgrader(colony.room.energyCapacityAvailable);

        const emptyUpgrader = colony.upgraders.find(
            (upgrader) => !upgrader.store[RESOURCE_ENERGY]
        );
        if (emptyUpgrader) return;
        // Even though the upgraders are all full,
        // we don't need more upgraders since our container is empty
        const upgraderContainer = colony.getUpgraderContainer();
        if (upgraderContainer && !upgraderContainer.store[RESOURCE_ENERGY])
            return;
        return creepMaker.makeUpgrader(colony.room.energyCapacityAvailable);
    },
};

//#endregion

const WEIGHT_IDLE_HAULERS = 4;
const WEIGHT_EXCESS_ENERGY = 1 / 15000;
const WEIGHT_WAITING_HAULERS = 5;
const WEIGHT_UNTENDED_PICKUPS = 3;

const getSortedGroups = (colony) => {
    // If we're in a cold boot situation, we'll skip regular spawning
    if (!colony.miners.length) {
        return [production];
    }
    if (!colony.haulers.length && !colony.starterHaulers.length) {
        return [transport];
    }

    // Declare some conditions we can use to decide our next spawn
    const conditions = [];

    // If we have idle haulers, let's vouch for producers
    const idleHaulers = colony.haulers.filter(
        (hauler) => hauler.store.getUsedCapacity() === 0 && hauler.memory.idle
    );
    conditions.push({
        score: idleHaulers.length * WEIGHT_IDLE_HAULERS,
        order: [production, usage],
    });

    // If we have lots of untended pickups, let's vouch for transporters
    const averageHaulerSize =
        creepMaker
            .makeHauler(calculateMinEnergy(colony))
            .body.filter((p) => p === CARRY).length * CARRY_CAPACITY;
    const untendedPickups = colony
        .getPickupRequests({
            store: { getCapacity: () => averageHaulerSize },
        })
        .filter((r) => !r.hasEnough);
    conditions.push({
        score: untendedPickups.length * WEIGHT_UNTENDED_PICKUPS,
        order: [transport, usage, production],
    });

    // If we have haulers waiting for dropoffs, let's vouch for spenders
    // But only if we don't have many untended pickups
    if (untendedPickups.length <= colony.haulers.length) {
        if (colony.room.storage) {
            const excessEnergy = Math.max(
                colony.room.storage.store[RESOURCE_ENERGY] -
                    storageThresholds[colony.room.controller.level],
                0
            );
            conditions.push({
                score:
                    excessEnergy * WEIGHT_EXCESS_ENERGY -
                    colony.upgraders.length,
                order: [usage, transport, production],
            });
        } else {
            const waitingHaulers = colony.haulers.filter(
                (hauler) =>
                    hauler.store.getUsedCapacity() > 0 && hauler.memory.idle
            );
            conditions.push({
                score: waitingHaulers * WEIGHT_WAITING_HAULERS,
                order: [usage, production, transport],
            });
        }
    }

    // Pick the most currently important one
    return _.max(conditions, (c) => c.score).order;
};

const getRelevantSpawnRequests = (colony, availableSpawns) => {
    const groups = getSortedGroups(colony);
    const allRequests = [];
    const requestsByRole = {};

    // We'll ignore spawn requests if we have fewer creeps than can maintain our colony
    const meetsMinimumRequestThreshold =
        colony.miners.length >= colony.sources.length && colony.haulers.length;

    // We'll consider one off requests as above the group they've been given for priority
    // i.e. a priority 0 would come first, then a priority 1 would come after our first sorted group
    const oneOffs = meetsMinimumRequestThreshold
        ? colony.getSpawnRequests().sort((a, b) => a.priority - b.priority)
        : [];

    // This will simply add eco requests until we're added enough
    let i = 0;
    for (let group of groups) {
        while (oneOffs.length && oneOffs[0].priority <= i) {
            const added = oneOffs.shift();
            group = { [added.role]: added.make, ...group };
        }
        i++;

        for (const role in group) {
            if (allRequests.length >= availableSpawns) return allRequests;

            // Here we have to look for the key rather than use the value of the role,
            // since that's what's used in the Colony object
            const matchingRole = Object.keys(roles).find(
                (r) => roles[r] === role
            );

            const current = colony[matchingRole + "s"].length;
            const scheduled = requestsByRole[role] || 0;

            const request = group[role](colony, current + scheduled);

            // If this spawn profile had no desire for an additional spawn,
            // we'll go to the next one
            if (!request) continue;

            // If we can't afford the new creep, let's ignore it as well
            if (
                !request.body.length ||
                getCost(request.body) > colony.room.energyCapacityAvailable
            )
                continue;

            console.log(colony.room.name + ": " + request.name);

            allRequests.push(request);
            requestsByRole[role] = (requestsByRole[roles] || 0) + 1;
        }
    }

    // Add our remaining, lowest priority, one-offs
    allRequests.push(...oneOffs);
    return allRequests;
};

module.exports = {
    getRelevantSpawnRequests,
};
