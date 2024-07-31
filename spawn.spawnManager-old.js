const {
    roles,
    storageThresholds,
    REMOTE_ROAD_RCL,
    REMOTE_CONTAINER_RCL,
} = require("./constants");
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

//#region Events

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
    const newHauler = spawnsByRole[roles.hauler](colony);
    const carryPerHauler = newHauler.body.filter((p) => p === CARRY).length;
    const neededCarry = remote.neededCarry / unreservedRatio;
    const neededHaulers = Math.floor(neededCarry / carryPerHauler);

    const newMiner = spawnsByRole[roles.miner](colony);
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

//#endregion

class SpawnManager {
    run(colony) {
        // Ensure demands exist
        ensureDefaults(colony);

        const meetsMinimumSpawnRequirements = (colony) => {
            return (
                colony.miners.length &&
                (colony.haulers.length || colony.starterHaulers.length)
            );
        };

        // Nudge the spawn demands in whichever direction they need to go in
        // Calculated by the handlers
        profiler.startSample("demand");
        for (const role in demandHandlers) {
            if (!meetsMinimumSpawnRequirements(colony)) {
                setRoleDemand(colony, role, DEFAULT_DEMANDS[role] || 0);
                continue;
            }

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
                            colony.room.energyCapacityAvailable ||
                        !newCreep.body.length
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
            // Simply find the first colony missing one of these creeps
            const supportingColony =
                colony.memory.supporting && colony.memory.supporting.length
                    ? colony.memory.supporting.find(
                          (s) =>
                              Memory.newColonies[s].spawnDemands[
                                  next.memory.role
                              ] &&
                              Memory.newColonies[s].spawnDemands[
                                  next.memory.role
                              ] >
                                  Memory.newColonies[
                                      s
                                  ].creepNamesAndRoles.filter(
                                      (c) => c.role === next.memory.role
                                  ).length
                      )
                    : null;
            if (supportingColony) {
                next.memory.expansionTarget = supportingColony;
            }

            // Save the room responsible for this creep and start spawning
            next.memory.home = colony.room.name;
            const result = spawn.spawnCreep(next.body, next.name, {
                memory: next.memory,
            });

            // If we succesfully spawned, let's let all other colonies know that we've spawned this creep
            if (result === OK) {
                if (supportingColony) {
                    Memory.newColonies[
                        supportingColony
                    ].creepNamesAndRoles.push({
                        name: next.name,
                        role: next.memory.role,
                    });
                }
            } else {
                // Don't count the spawn as active if it's not actually spawning anything
                inactiveSpawns.push(spawn);
            }

            // Let's wait until we have enough energy
            if (result === ERR_NOT_ENOUGH_ENERGY) {
                break;
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
        overlay.addHeading(colony.room.name + "_a", "Spawn Demands");
        for (const role of Object.values(roles)) {
            const demand = getRoleDemand(colony, role);
            if (!demand) continue;
            const value = demand.value;
            if (!value) continue;
            overlay.addColumns(colony.room.name + "_a", role, value.toFixed(4));
        }
    }
}

module.exports = SpawnManager;
