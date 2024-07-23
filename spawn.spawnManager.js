const { roles, storageThresholds } = require("./constants");
const {
    DEFAULT_DEMANDS,
    MIN_MAX_DEMAND,
    ensureDefaults,
    getRoleDemand,
    setRoleDemand,
    nudgeRoleDemand,
    bumpRoleDemand,
} = require("./spawn.demandHandler");
const { getCost } = require("./spawn.spawnUtility");

const creepMaker = require("./spawn.creepMaker");
const overlay = require("./debug.overlay");
const profiler = require("./debug.profiler");

const RAISE_HAULER_THRESHOLD = 2;
const LOWER_HAULER_THRESHOLD = 2;

const RAISE_UPGRADER_THRESHOLD = 1;
const LOWER_UPGRADER_THRESHOLD = 2;

/*
// Don't be too concerned unless these structures get extra low since they decay naturally
const REPAIR_THRESHOLDS = {
    [STRUCTURE_WALL]: 0.002,
    [STRUCTURE_RAMPART]: 0.005,
    [STRUCTURE_CONTAINER]: 0.5,
    [STRUCTURE_ROAD]: 0.5,
};
*/

const meetsMinimumSpawnRequirements = (colony) => {
    return (
        colony.miners.length &&
        (colony.haulers.length || colony.starterHaulers.length)
    );
};

/**
 * Demand handlers handle nudging the demand slightly towards
 * the ideal value of roles that fluctuate need a lot.
 * They do not need to exist for each role, only roles
 * that we expect to see regularily contribute to economy,
 * but cannot accurately determine an exact value for.
 * Other role types will have to have their spawn demand bumped
 * up or down depending on other, less predictable factors.
 */
const demandHandlers = {
    [roles.defender]: (colony, set, nudge, bump) => {
        if (!meetsMinimumSpawnRequirements(colony)) {
            return set(0);
        }
        const enemies = colony.getEnemies();
        const diff = Math.max(enemies.length - colony.defenders.length, 0);
        set(diff);
    },
    [roles.miner]: (colony, set, nudge, bump) => {
        if (!meetsMinimumSpawnRequirements(colony)) {
            return set(DEFAULT_DEMANDS[roles.miner]);
        }
        // If we have an open site, nudge miners
        if (colony.getFirstOpenMiningSite()) {
            return nudge(2);
        }
        // Otherwise, let's keep our miner count at the number of working miners
        const unassignedMiners = colony.miners.filter(
            (miner) => !miner.memory.miningSite
        );
        const workingMinerCount =
            colony.miners.length - unassignedMiners.length;
        return set(workingMinerCount - 0.5);
    },
    [roles.hauler]: (colony, set, nudge, bump) => {
        if (!meetsMinimumSpawnRequirements(colony)) {
            return set(DEFAULT_DEMANDS[roles.hauler]);
        }

        // Reduce proportional to the number of idle haulers
        // Idle meaning empty and not picking up or returning from a trip
        const idleHaulers = colony.haulers.filter(
            (hauler) =>
                !hauler.memory.dropoff &&
                !hauler.memory.pickup &&
                !hauler.memory.returning
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
                .body.filter((p) => p === CARRY).length * CARRY_CAPACITY;
        const untendedPickups = colony
            .getPickupRequests({
                store: { getCapacity: () => currentHaulerSize },
            })
            .filter(
                (r) => r.assignedHaulers.length * currentHaulerSize < r.amount
            );

        // Initially we won't be able to raise our count
        // because only 1 request will be able to exist
        const threshold = Math.min(
            colony.miners.length,
            RAISE_HAULER_THRESHOLD
        );
        if (untendedPickups.length >= threshold) {
            return bump(1);
        }

        // If there's no problems at all, let's nudge towards our current count
        const target = colony.haulers.length - 0.5;
        return nudge(haulerDemand < target ? 1 : -1);
    },
    [roles.upgrader]: (colony, set, nudge, bump) => {
        if (!meetsMinimumSpawnRequirements(colony)) {
            return set(DEFAULT_DEMANDS[roles.upgrader]);
        }

        // Priority #1: are upgraders full?
        const upgraders = colony.upgraders;
        const fullUpgraders = upgraders.filter(
            (upgrader) =>
                upgrader.pos.getRangeTo(colony.room.controller.pos) <= 3 &&
                upgrader.store[RESOURCE_ENERGY]
        );
        const unfilledUpgraders = upgraders.length - fullUpgraders.length;
        if (unfilledUpgraders > LOWER_UPGRADER_THRESHOLD) {
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
        if (waitingHaulers > RAISE_UPGRADER_THRESHOLD) {
            return nudge(waitingHaulers);
        }

        // If there's no problems at all, let's nudge towards our current count
        const upgraderDemand = getRoleDemand(colony, roles.upgrader).value;
        const target = colony.upgraders.length - 0.5;
        return nudge(upgraderDemand < target ? 1 : -1);
    },
    [roles.scout]: (colony, set, nudge, bump) => {
        if (!meetsMinimumSpawnRequirements(colony)) {
            return set(0);
        }
        set(1);
    },
    [roles.builder]: (colony, set, nudge, bump) => {
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
    [roles.repairer]: (colony, set, nudge, bump) => {
        // TODO //
    },
    [roles.mineralMiner]: (colony, set, nudge, bump) => {
        const amount = colony.structures[STRUCTURE_EXTRACTOR] ? 1 : 0;
        set(amount);
    },
    [roles.claimer]: (colony, set, nudge, bump) => {
        if (!colony.memory.supporting) {
            return set(0);
        }
        set(
            colony.memory.supporting.length -
                filterSupportingColoniesForRole(colony, roles.claimer)
        );
    },
    [roles.colonizerBuilder]: (colony, set, nudge, bump) => {
        if (!colony.memory.supporting) {
            return set(0);
        }
        set(
            colony.memory.supporting.length -
                filterSupportingColoniesForRole(colony, roles.colonizerBuilder)
        );
    },
    [roles.colonizerHauler]: (colony, set, nudge, bump) => {
        if (!colony.memory.supporting) {
            return set(0);
        }
        set(
            colony.memory.supporting.length -
                filterSupportingColoniesForRole(colony, roles.colonizerHauler)
        );
    },
};

// This totals up the number of creeps of this role that are owned by each of our supporting rooms
const filterSupportingColoniesForRole = (colony, role) =>
    colony.memory.supporting.reduce(
        (total, curr) =>
            total +
            curr.creepNames.filter(
                (cn) => Game.creeps[cn].memory.role === role
            ),
        0
    );

/**
 * Here we can subscribe to any important colony events that might
 * impact our spawn demands, like the adding or dropping of remotes.
 */
const {
    onRemoteAdd,
    onRemoteDrop,
    onRCLUpgrade,
} = require("./event.colonyEvents");
const { MINER_WORK } = require("./spawn.spawnConstants");

const getDemands = (colony, remote) => {
    const canReserve =
        colony.room.energyCapacityAvailable >= creepMaker.RESERVER_COST;
    const unreservedRatio = canReserve
        ? 1
        : SOURCE_ENERGY_CAPACITY / SOURCE_ENERGY_NEUTRAL_CAPACITY;

    // Quickly roughly calculate how many haulers and miners we'll need
    // to support this remote
    // Note that the above calculates a ratio for unreserved rooms in the case
    // we cannot yet reserve our remotes
    const newHauler = creepMaker.makeHauler(
        colony.room.energyCapacityAvailable
    );
    const carryPerHauler = newHauler.body.filter((p) => p === CARRY).length;
    const neededCarry = remote.neededCarry / unreservedRatio;
    const neededHaulers = Math.floor(neededCarry / carryPerHauler);

    const newMiner = creepMaker.makeMiner(colony.room.energyCapacityAvailable);
    const workPerMiner = newMiner.body.filter((p) => p === WORK).length;
    const neededWork = MINER_WORK / unreservedRatio;
    const neededMiners = Math.ceil(neededWork / workPerMiner);

    // Let's also determine if this remote is the only one in its room
    if (!colony.remotePlans) {
        return { neededHaulers, neededMiners, alone: true };
    }
    const sharingRoom = colony.remotePlans.find(
        (r) =>
            // Let's make sure we don't check ourselves
            r.source.id !== remote.source.id &&
            r.active &&
            r.room === remote.room
    );
    return {
        neededHaulers,
        neededMiners,
        alone: !sharingRoom,
    };
};
onRemoteAdd.subscribe((colony, remote) => {
    const { neededHaulers, neededMiners, alone } = getDemands(colony, remote);
    bumpRoleDemand(colony, roles.hauler, neededHaulers, true);
    bumpRoleDemand(colony, roles.miner, neededMiners, true);

    // If this is the only active remote in this room, let's add a reserver
    if (alone) {
        bumpRoleDemand(colony, roles.reserver, 1, true);
    }
});
onRemoteDrop.subscribe((colony, remote) => {
    const { neededHaulers, neededMiners, alone } = getDemands(colony, remote);
    bumpRoleDemand(colony, roles.hauler, -neededHaulers, true);
    bumpRoleDemand(colony, roles.miner, -neededMiners, true);

    // If this was the only active remote in this room, let's remove a reserver
    if (alone) {
        bumpRoleDemand(colony, roles.reserver, -1, true);
    }
});

onRCLUpgrade.subscribe((colony, newRCL) => {
    // Here we'll bump upgrader demand down to make way for new builders
    // we'll do this proportionally to their usage
    const newBuilder = creepMaker.makeBuilder(
        colony.room.energyCapacityAvailable
    );
    const workPerBuilder = newBuilder.body.filter((p) => p === WORK).length;
    const builderUsage =
        workPerBuilder * BUILD_POWER * MIN_MAX_DEMAND[roles.builder].max;

    const newUpgrader = creepMaker.makeUpgrader(
        colony.room.energyCapacityAvailable
    );
    const workPerUpgrader = newUpgrader.body.filter((p) => p === WORK).length;
    const usagePerUpgrader = workPerUpgrader * UPGRADE_CONTROLLER_POWER;

    const upgradersEquivalentToNewBuilders = builderUsage / usagePerUpgrader;
    bumpRoleDemand(colony, roles.upgrader, -upgradersEquivalentToNewBuilders);
});

/**
 * Define how our roles should be spawned.
 * Ordered by spawn priority.
 * All roles we wish to spawn should be included here.
 */
const spawnsByRole = {
    [roles.defender]: (colony) => {
        const enemies = colony.getEnemies();
        if (enemies.length) {
            // Find our strongest enemy
            const mostFightParts = enemies.reduce((strongest, curr) => {
                const fightParts = curr.body.filter(
                    (p) =>
                        p.type === RANGED_ATTACK ||
                        p.type === ATTACK ||
                        p.type === HEAL
                ).length;
                return fightParts > strongest ? fightParts : strongest;
            }, 0);

            // Make an appropriately sized defender
            // i.e. one level larger in size
            return creepMaker.makeMiniDefender(
                Math.ceil(mostFightParts / 4) + 1,
                colony.room.energyCapacityAvailable
            );
        }
    },
    [roles.miner]: (colony) => creepMaker.makeMiner(getMinEnergy(colony)),
    [roles.hauler]: (colony) => {
        if (
            colony.haulers.length === 0 &&
            colony.starterHaulers.length === 0 &&
            colony.room.controller.level === 1
        ) {
            // If we're just starting out, we'll make a special small hauler
            // that will become a scout in the future
            return creepMaker.makeStarterHauler();
        }
        return creepMaker.makeHauler(getMinEnergy(colony));
    },
    [roles.upgrader]: (colony) =>
        creepMaker.makeUpgrader(colony.room.energyCapacityAvailable),
    [roles.reserver]: (colony) => creepMaker.makeReserver(),

    // Expansion creeps, when we have a good eco
    [roles.claimer]: (colony) => creepMaker.makeClaimer(),
    [roles.colonizerBuilder]: (colony) =>
        creepMaker.makeColonizerBuilder(colony.room.energyCapacityAvailable),
    [roles.colonizerHauler]: (colony) =>
        creepMaker.makeColonizerHauler(colony.room.energyCapacityAvailable),

    [roles.scout]: (colony) => creepMaker.makeScout(),
    [roles.builder]: (colony) =>
        creepMaker.makeBuilder(colony.room.energyCapacityAvailable),
    [roles.repairer]: (colony) =>
        creepMaker.makeRepairer(colony.room.energyCapacityAvailable),
    [roles.mineralMiner]: (colony) =>
        creepMaker.makeMineralMiner(colony.room.energyCapacityAvailable),
};

const getMinEnergy = (colony) =>
    colony.miners.length && colony.haulers.length
        ? colony.room.energyCapacityAvailable
        : SPAWN_ENERGY_START;

class SpawnManager {
    run(colony) {
        // Ensure demands exist
        ensureDefaults(colony);

        // Nudge the spawn demands in whichever direction they need to go in
        // Calculated by the handlers
        profiler.startSample("demand");
        for (const role in demandHandlers) {
            const handler = demandHandlers[role];
            profiler.wrap(role, () =>
                handler(
                    colony,
                    (amount) => setRoleDemand(colony, role, amount),
                    (amount) => nudgeRoleDemand(colony, role, amount),
                    (amount) => bumpRoleDemand(colony, role, amount)
                )
            );
        }
        profiler.endSample("demand");

        // Track our spawning activity
        profiler.startSample("activity");
        const inactiveSpawns = [];
        for (const spawn of colony.structures[STRUCTURE_SPAWN]) {
            if (spawn.spawning) {
                this.showVisuals(spawn);
                continue;
            }
            inactiveSpawns.push(spawn);
        }
        profiler.endSample("activity");

        // We'll track how many of each role we've spawned this tick to avoid
        // spawning the same creep at multiple spawns if they become open on the same tick
        const spawnedThisTick = {};
        const getNextSpawn = () => {
            // Let's look for our highest priority role that needs a creep
            for (const role in spawnsByRole) {
                const demand = getRoleDemand(colony, role).value;

                // Here we have to look for the key rather than use the value of the role,
                // since that's what's used in the Colony object
                const matchingRole = Object.keys(roles).find(
                    (r) => roles[r] === role
                );
                const current = colony[matchingRole + "s"].length;
                const thisTick = spawnedThisTick[role] || 0;
                if (demand > current + thisTick) {
                    // If we can't afford the new creep, let's ignore it
                    const newCreep = spawnsByRole[role](colony);
                    if (
                        getCost(newCreep.body) >
                        colony.room.energyCapacityAvailable
                    ) {
                        continue;
                    }
                    spawnedThisTick[role] = thisTick + 1;
                    profiler.endSample("spawning");
                    return newCreep;
                }
            }
        };

        profiler.startSample("spawning");
        while (inactiveSpawns.length) {
            const spawn = inactiveSpawns.pop();
            const next = profiler.wrap("next spawn", () => getNextSpawn());
            if (!next) {
                inactiveSpawns.push(spawn);
                break;
            }

            // If we're supporting another colony, let's assign this creep to it
            const supportingColony =
                colony.memory.supporting && colony.memory.supporting.length
                    ? colony.memory.supporting.find((s) =>
                          Memory.newColonies[s].spawns.includes(
                              next.memory.role
                          )
                      )
                    : null;
            if (supportingColony) {
                next.memory.expansionTarget = supportingColony;
                Memory.newColonies[supportingColony].creepNames.push(next.name);
            }

            // Save the room responsible for this creep and start spawning
            next.memory.home = colony.room.name;
            const result = spawn.spawnCreep(next.body, next.name, {
                memory: next.memory,
            });

            if (result !== OK) {
                // Didn't spawn successfully, don't count the spawn as active
                inactiveSpawns.push(spawn);
            }
        }
        profiler.endSample("spawning");

        this.drawOverlay(colony);

        // Track our spawn usage
        return (
            colony.structures[STRUCTURE_SPAWN].length - inactiveSpawns.length
        );
    }

    /**
     * Shows visuals for this spawn, if spawning.
     * @param {StructureSpawn} spawn The spawn to show visuals for.
     */
    showVisuals(spawn) {
        try {
            const spawningCreep = Game.creeps[spawn.spawning.name];
            const displayName =
                spawningCreep.name.split(" ")[0] +
                " " +
                spawningCreep.name.split(" ")[2];
            Game.rooms[spawn.pos.roomName].visual.text(
                displayName,
                spawn.pos.x,
                spawn.pos.y - 1,
                { align: "center", opacity: 0.6 }
            );
        } catch (e) {
            console.log("Error when showing spawn visual: " + e);
        }
    }

    drawOverlay(colony) {
        overlay.addHeading(colony.room.name + "0", "Spawn Demands");
        for (const role in roles) {
            const demand = getRoleDemand(colony, role).value;
            if (!demand) {
                continue;
            }
            overlay.addColumns(colony.room.name + "0", role, demand.toFixed(4));
        }
    }
}

module.exports = SpawnManager;
