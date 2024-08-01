const {
    roles,
    storageThresholds,
    REMOTE_ROAD_RCL,
    REMOTE_CONTAINER_RCL,
} = require("./constants");
const {
    MIN_MAX_DEMAND,
    getRoleDemand,
    setRoleDemand,
    nudgeRoleDemand,
    bumpRoleDemand,
} = require("./spawn.demandHandler");

const creepMaker = require("./spawn.creepMaker");
const Colony = require("./data.colony");

const RAISE_HAULER_THRESHOLD = 2;
const LOWER_HAULER_THRESHOLD = 2;

const LOWER_UPGRADER_THRESHOLD = 2;

//#region Utility

const calculateSupportingColonySpawnDemand = (colony, role) =>
    colony.memory.supporting.reduce((total, curr) => {
        const newCol = Memory.newColonies[curr];
        const wanting = newCol.spawnDemands[role];
        const existing = newCol.creepNamesAndRoles.filter(
            (c) => c.role === role
        );
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
 * @typedef {Object} SpawnProfile
 * @property {(colony: Colony,
 *  set: (amount: number) => void,
 *  nudge: (amount: number) => void,
 *  bump: (amount: number) => void) => void
 * } handleDemand Handles determining spawn demand for this creep in
 * the given colony. Demand can be modified instantaneously through a `set` command, spiked in a particular direction
 * using a `bump` command, or gradually slid in a direction with a `nudge` command.
 * @property {(colony: Colony) => SpawnRequest} make Handles creation of the spawn request for this type of creep.
 */

/**
 * A spawn group is responsible for spawning creeps that complete a
 * specific goal for our colony, like harvesting energy, transport, or spending.
 */
class SpawnGroup {
    /**
     * Initializes this group with the given spawn profiles.
     * @param {{[key: string]: SpawnProfile}} profiles An object mapping roles to the spawn profiles in order of their priority.
     * @param {(colony: Colony) => number} getPriority Function to determine priority of this group for the given colony.
     * will be in order of priority.
     */
    constructor(profiles, getPriority) {
        this.profiles = profiles;
        this.getPriority = getPriority;
    }

    /**
     * Runs through all spawn profiles and calls their `handleDemand` method.
     * @param {Colony} colony The colony to update demands for.
     */
    updateDemands(colony) {
        for (const role in this.profiles) {
            const profile = this.profiles[role];
            profile.handleDemand(
                colony,
                (amount) => setRoleDemand(colony, role, amount),
                (amount) => nudgeRoleDemand(colony, role, amount),
                (amount) => bumpRoleDemand(colony, role, amount)
            );
        }
    }

    /**
     * Iterates over the spawn profiles in order of priority to find the next one in need of spawning.
     * @param {Colony} colony The colony to determine the next spawn for.
     * @return {SpawnRequest} A newly created `SpawnRequest object with the necessary spawning info.
     */
    getNextSpawn(colony) {
        for (const role in this.profiles) {
            // Here we have to look for the key rather than use the value of the role,
            // since that's what's used in the Colony object
            const matchingRole = Object.keys(roles).find(
                (r) => roles[r] === role
            );

            const demand = getRoleDemand(colony, role);
            const current = colony[matchingRole + "s"].length;
            if (demand > current) {
                const profile = this.profiles[role];
                const newCreep = profile.make(colony);

                // If we can't afford the new creep, let's ignore it
                if (
                    getCost(newCreep.body) >
                        colony.room.energyCapacityAvailable ||
                    !newCreep.body.length
                ) {
                    continue;
                }
                return newCreep;
            }
        }
    }
}

//#endregion

//#region Groups

const defense = new SpawnGroup(
    {
        [roles.defender]: {
            handleDemand: (colony, set, nudge, bump) => {
                const diff = Math.max(
                    colony.remoteEnemies.length - colony.defenders.length,
                    0
                );
                set(diff);
            },
            make: (colony) => {
                if (colony.remoteEnemies.length) {
                    // Find our strongest enemy
                    const mostFightParts = colony.remoteEnemies.reduce(
                        (strongest, curr) => {
                            const fightParts = curr.body.filter(
                                (p) =>
                                    p.type === RANGED_ATTACK ||
                                    p.type === ATTACK ||
                                    p.type === HEAL
                            ).length;
                            return fightParts > strongest
                                ? fightParts
                                : strongest;
                        },
                        0
                    );

                    // Make an appropriately sized defender
                    // i.e. one level larger in size
                    return creepMaker.makeMiniDefender(
                        Math.ceil(mostFightParts / 4) + 1,
                        colony.room.energyCapacityAvailable
                    );
                }
            },
        },
    },
    (colony) => {
        return 0;
    }
);

const production = new SpawnGroup(
    {
        [roles.miner]: {
            handleDemand: (colony, set, nudge, bump) => {
                // If we have an open site, nudge miners
                if (colony.getFirstOpenMiningSite()) {
                    return nudge(2);
                }
                // Otherwise, let's keep our miner count at the number of working miners
                const assignedMiners = colony.miners.filter(
                    (miner) => miner.memory.miningSite
                );
                return set(assignedMiners.length - 0.5);
            },
            make: (colony) =>
                creepMaker.makeMiner(
                    calculateMinEnergy(colony),
                    colony.memory.constructionLevel >= REMOTE_CONTAINER_RCL
                ),
        },
        [roles.reserver]: {
            handleDemand: () => {},
            make: (colony) => creepMaker.makeReserver(),
        },
        [roles.cleaner]: {
            handleDemand: (colony, set, nudge, bump) => {
                set(colony.invaderCores.length);
            },
            make: (colony) =>
                creepMaker.makeCleaner(colony.room.energyCapacityAvailable),
        },
    },
    (colony) => {
        return 0;
    }
);

const transport = new SpawnGroup(
    {
        [roles.hauler]: {
            handleDemand: (colony, set, nudge, bump) => {
                // Reduce proportional to the number of idle haulers
                // Idle meaning empty and not picking up
                const idleHaulers = colony.haulers.filter(
                    (hauler) =>
                        hauler.store.getUsedCapacity() === 0 &&
                        !hauler.memory.pickup
                ).length;
                const workingHaulers = colony.haulers.length - idleHaulers;
                const haulerDemand = getRoleDemand(colony, roles.hauler).value;
                if (
                    idleHaulers >= LOWER_HAULER_THRESHOLD &&
                    haulerDemand >= workingHaulers
                ) {
                    return nudge(-idleHaulers);
                }

                // We'll consider haulers of the current spawn size
                const currentHaulerSize =
                    creepMaker
                        .makeHauler(colony.room.energyCapacityAvailable)
                        .body.filter((p) => p === CARRY).length *
                    CARRY_CAPACITY;
                const untendedPickups = colony
                    .getPickupRequests({
                        store: { getCapacity: () => currentHaulerSize },
                    })
                    .filter(
                        (r) =>
                            r.assignedHaulers.length * currentHaulerSize <
                            r.amount
                    );
                // Don't increase our demand if we have haulers waiting on orders
                const waitingHaulers = colony.haulers.filter(
                    (hauler) =>
                        hauler.store.getUsedCapacity() > 0 &&
                        !(hauler.memory.dropoff || hauler.memory.returning)
                ).length;

                // Initially we won't be able to raise our count
                // because only 1 request will be able to exist
                const threshold = Math.min(
                    colony.miners.length,
                    RAISE_HAULER_THRESHOLD
                );
                if (untendedPickups.length >= threshold && !waitingHaulers) {
                    return nudge(untendedPickups.length - threshold + 1);
                }

                // If there's no problems at all, let's nudge towards our current count
                const target = colony.haulers.length - 0.5;
                return nudge(haulerDemand < target ? 2 : -2);
            },
            make: (colony) => {
                if (
                    colony.haulers.length === 0 &&
                    colony.starterHaulers.length === 0 &&
                    colony.room.controller.level === 1
                ) {
                    // If we're just starting out, we'll make a special small hauler
                    // that will become a scout in the future
                    return creepMaker.makeStarterHauler();
                }
                return creepMaker.makeHauler(
                    calculateMinEnergy(colony),
                    colony.memory.constructionLevel >= REMOTE_ROAD_RCL ? 2 : 1
                );
            },
        },
    },
    (colony) => {
        return 0;
    }
);

const usage = new SpawnGroup(
    {
        [roles.repairer]: {
            handleDemand: (colony, set, nudge, bump) => {
                set(colony.remotesNeedingRepair.length ? 1 : 0);
            },
            make: (colony) =>
                creepMaker.makeRepairer(colony.room.energyCapacityAvailable),
        },
        [roles.scout]: {
            handleDemand: (colony, set, nudge, bump) => {
                set(1);
            },
            make: (colony) => creepMaker.makeScout(),
        },
        [roles.builder]: {
            handleDemand: (colony, set, nudge, bump) => {
                if (colony.miners.length >= colony.sources.length) {
                    if (colony.constructionSites.length > 1) {
                        return set(MIN_MAX_DEMAND[roles.builder].max);
                    }
                    if (colony.constructionSites.length === 1) {
                        return set(0.5);
                    }
                }
                return set(0);
            },
            make: (colony) =>
                creepMaker.makeBuilder(colony.room.energyCapacityAvailable),
        },
        [roles.claimer]: {
            handleDemand: (colony, set, nudge, bump) => {
                set(
                    calculateSupportingColonySpawnDemand(colony, roles.claimer)
                );
            },
            make: (colony) => creepMaker.makeClaimer(),
        },
        [roles.colonizerBuilder]: {
            handleDemand: (colony, set, nudge, bump) => {
                set(
                    calculateSupportingColonySpawnDemand(
                        colony,
                        roles.colonizerBuilder
                    )
                );
            },
            make: (colony) =>
                creepMaker.makeColonizerBuilder(
                    colony.room.energyCapacityAvailable
                ),
        },
        [roles.colonizerDefender]: {
            handleDemand: (colony, set, nudge, bump) => {
                set(
                    calculateSupportingColonySpawnDemand(
                        colony,
                        roles.colonizerDefender
                    )
                );
            },
            make: (colony) =>
                creepMaker.makeColonizerDefender(
                    colony.room.energyCapacityAvailable
                ),
        },
        [roles.mineralMiner]: {
            handleDemand: (colony, set, nudge, bump) => {
                const amount = colony.structures[STRUCTURE_EXTRACTOR] ? 1 : 0;
                set(amount);
            },
            make: (colony) =>
                creepMaker.makeMineralMiner(
                    colony.room.energyCapacityAvailable
                ),
        },
        [roles.upgrader]: {
            handleDemand: (colony, set, nudge, bump) => {
                // Priority #1: are upgraders full?
                const upgraders = colony.upgraders;
                const fullUpgraders = upgraders.filter(
                    (upgrader) =>
                        upgrader.pos.getRangeTo(colony.room.controller.pos) <=
                            3 && upgrader.store[RESOURCE_ENERGY]
                );
                const unfilledUpgraders =
                    upgraders.length - fullUpgraders.length;
                const upgraderDemand = getRoleDemand(
                    colony,
                    roles.upgrader
                ).value;
                if (
                    unfilledUpgraders > LOWER_UPGRADER_THRESHOLD &&
                    upgraderDemand >= fullUpgraders.length
                ) {
                    return nudge(-unfilledUpgraders);
                }

                // Priority #2: do all haulers have dropoff points?
                const waitingHaulers = colony.haulers.filter((hauler) => {
                    if (hauler.memory.returning) {
                        return false;
                    }
                    const full = hauler.store[RESOURCE_ENERGY];
                    const storageDropoff =
                        colony.room.storage &&
                        colony.room.storage.id === hauler.memory.dropoff;
                    const storageAboveThreshold =
                        colony.room.storage &&
                        colony.room.storage.store[RESOURCE_ENERGY] >
                            storageThresholds[colony.room.controller.level];
                    return (
                        full &&
                        (!hauler.memory.dropoff ||
                            (storageDropoff && storageAboveThreshold))
                    );
                }).length;
                if (waitingHaulers) {
                    return nudge(waitingHaulers);
                }

                // If there's no problems at all, let's nudge towards our current count
                const target = colony.upgraders.length - 0.5;
                return nudge(upgraderDemand < target ? 2 : -2);
            },
            make: (colony) =>
                creepMaker.makeUpgrader(colony.room.energyCapacityAvailable),
        },
    },
    (colony) => {
        return 0;
    }
);

//#endregion

module.exports = [defense, production, transport, usage];
