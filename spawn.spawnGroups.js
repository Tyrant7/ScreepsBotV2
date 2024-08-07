const {
    roles,
    REMOTE_ROAD_RCL,
    REMOTE_CONTAINER_RCL,
    storageThresholds,
} = require("./constants");
const { getCost } = require("./spawn.spawnUtility");

const creepMaker = require("./spawn.creepMaker");
const Colony = require("./data.colony");
const { getAllMissions } = require("./combat.missionUtility");

//#region Utility

const calculateSupportingColonySpawnDemand = (colony, role) =>
    colony.memory.supporting.reduce((total, curr) => {
        const mission = getAllMissions()[curr];
        const wanting = mission.data.spawnDemands[role];
        const existing = mission.data.creepNamesAndRoles.filter(
            (c) => c.role === role
        ).length;
        return total + Math.max(wanting - existing, 0);
    }, 0);

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

/**
 * A spawn group is responsible for spawning creeps that complete a
 * specific goal for our colony, like harvesting energy, transport, or spending.
 */
class SpawnGroup {
    /**
     * Initializes this group with the given spawn profiles.
     * @param {string} debugName The name to print out when debugging.
     * @param {{[role: string]: (colony: Colony, count: number) => SpawnRequest | undefined}} profiles
     * An object which maps roles to method which returns a `SpawnRequest` for each creep type in this spawn group,
     * where `colony` is the colony to get the next spawn for, and `count` is the number of existing spawned creeps
     * of that role.
     */
    constructor(debugName, profiles) {
        this.debugName = debugName;
        this.profiles = profiles;
    }

    /**
     * Iterates over the spawn profiles in order of priority to find the next one in need of spawning.
     * @param {Colony} colony The colony to determine the next spawn for.
     * @param {{ [role: string]: number }} spawnsThisTick An object with the number spawns already scheduled this tick
     * for this colony. Undefined if none.
     * @return {SpawnRequest | undefined} A newly created `SpawnRequest object with the necessary spawning info.
     */
    getNextSpawn(colony, spawnsThisTick) {
        for (const role in this.profiles) {
            // Here we have to look for the key rather than use the value of the role,
            // since that's what's used in the Colony object
            const matchingRole = Object.keys(roles).find(
                (r) => roles[r] === role
            );

            const current = colony[matchingRole + "s"].length;
            const scheduled = spawnsThisTick[role] || 0;

            const makeCreep = this.profiles[role];
            const newCreep = makeCreep(colony, current + scheduled);

            // If this spawn profile had no desire for an additional spawn,
            // we'll go to the next one
            if (!newCreep) continue;

            // If we can't afford the new creep, let's ignore it as well
            if (
                !newCreep.body.length ||
                getCost(newCreep.body) > colony.room.energyCapacityAvailable
            )
                continue;
            return newCreep;
        }
    }
}

//#endregion

//#region Groups

const defense = new SpawnGroup("defense", {
    [roles.defender]: (colony, count) => {
        if (count >= colony.remoteEnemies.length) return;

        // Find our strongest enemy
        const mostFightParts = colony.remoteEnemies.reduce(
            (strongest, curr) => {
                const fightParts = curr.body.filter(
                    (p) =>
                        p.type === RANGED_ATTACK ||
                        p.type === ATTACK ||
                        p.type === HEAL
                ).length;
                return fightParts > strongest ? fightParts : strongest;
            },
            0
        );

        // Make an appropriately sized defender
        // i.e. one level larger in size
        return creepMaker.makeMiniDefender(
            Math.ceil(mostFightParts / 4) + 1,
            colony.room.energyCapacityAvailable
        );
    },
});

const production = new SpawnGroup("production", {
    [roles.cleaner]: (colony, count) => {
        // Using / 2 to denote an arbitrary ratio of cleaners to cores
        if (count >= colony.invaderCores.length / 2) return;
        return creepMaker.makeCleaner(colony.room.energyCapacityAvailable);
    },
    [roles.reserver]: (colony, count) => {
        const remotesRoomsBeingMined = colony.remoteRooms.filter((r) =>
            colony.miners.find((m) => m.memory.miningSite.pos.roomName === r)
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
});

const transport = new SpawnGroup("transport", {
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
            (hauler) =>
                hauler.store.getUsedCapacity() === 0 && !hauler.memory.pickup
        );
        if (hasIdleHauler) return;

        return creepMaker.makeHauler(
            calculateMinEnergy(colony),
            colony.memory.constructionLevel >= REMOTE_ROAD_RCL ? 2 : 1
        );
    },
});

const usage = new SpawnGroup("usage", {
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
    [roles.claimer]: (colony, count) => {
        // We won't be able to support our expansions
        if (colony.room.energyCapacityAvailable < creepMaker.CLAIMER_COST)
            return;
        if (calculateSupportingColonySpawnDemand(colony, roles.claimer) <= 0)
            return;
        return creepMaker.makeClaimer();
    },
    [roles.colonizerBuilder]: (colony, count) => {
        if (colony.room.energyCapacityAvailable < creepMaker.CLAIMER_COST)
            return;
        if (
            calculateSupportingColonySpawnDemand(
                colony,
                roles.colonizerBuilder
            ) <= 0
        )
            return;
        return creepMaker.makeColonizerBuilder(
            colony.room.energyCapacityAvailable
        );
    },
    [roles.colonizerDefender]: (colony, count) => {
        if (colony.room.energyCapacityAvailable < creepMaker.CLAIMER_COST)
            return;
        if (
            calculateSupportingColonySpawnDemand(
                colony,
                roles.colonizerDefender
            ) <= 0
        )
            return;
        return creepMaker.makeColonizerDefender(
            colony.room.energyCapacityAvailable
        );
    },
    [roles.mineralMiner]: (colony, count) => {
        if (count > 0 || !colony.structures[STRUCTURE_EXTRACTOR]) return;
        return creepMaker.makeMineralMiner(colony.room.energyCapacityAvailable);
    },
    [roles.meleeDuo]: (colony, count) => {},
    [roles.upgrader]: (colony, count) => {
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
});

//#endregion

const groups = [defense, production, transport, usage];
const getSortedGroups = (colony) => {
    // If we're in a cold boot situation, we'll skip regular spawning
    if (!colony.miners.length) {
        return [production];
    }
    if (!colony.haulers.length && !colony.starterHaulers.length) {
        return [transport];
    }

    // If we have idle haulers, let's vouch for producers
    const idleHaulers = colony.haulers.filter(
        (hauler) =>
            hauler.store.getUsedCapacity() === 0 && !hauler.memory.pickup
    );

    // If we have haulers waiting for dropoffs, let's vouch for spenders
    const waitingHaulers = colony.haulers.filter(
        (hauler) =>
            hauler.store.getUsedCapacity() > 0 &&
            (!(hauler.memory.dropoff || hauler.memory.returning) ||
                (colony.room.storage &&
                    colony.room.storage.store[RESOURCE_ENERGY] >
                        storageThresholds[colony.room.controller.level] &&
                    hauler.memory.dropoff &&
                    hauler.memory.dropoff.id === colony.room.storage.id))
    );

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

    // We're going to look at all cases, and see which is most important
    const conditions = [
        {
            score: idleHaulers.length,
            order: [defense, production, usage],
        },
        {
            score: waitingHaulers.length,
            order: [defense, usage, production, transport],
        },
        {
            score: untendedPickups.length,
            order: [defense, transport, usage, production],
        },
    ];
    return _.max(conditions, (c) => c.score).order;
};

module.exports = {
    groups,
    getSortedGroups,
};
