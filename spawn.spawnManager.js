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
const haulerUtility = require("./util.haulerUtility");
const remoteUtility = require("./remote.remoteUtility");
const { getCost } = require("./spawn.spawnUtility");

const creepMaker = require("./spawn.creepMaker");
const overlay = require("./debug.overlay");

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
    [roles.defender]: (roomInfo, set, nudge, bump) => {
        if (!roomInfo.miners.length || !roomInfo.haulers.length) {
            return set(0);
        }
        const enemies = roomInfo.getEnemies();
        const diff = Math.max(enemies.length - roomInfo.defenders.length, 0);
        set(diff);
    },
    [roles.miner]: (roomInfo, set, nudge, bump) => {
        if (!roomInfo.miners.length || !roomInfo.haulers.length) {
            return set(DEFAULT_DEMANDS[roles.miner]);
        }
        // If we have an open site, nudge miners
        if (roomInfo.getFirstOpenMiningSite()) {
            return nudge(2);
        }
        // Otherwise, let's keep our miner count at the number of working miners
        const unassignedMiners = roomInfo.miners.filter(
            (miner) => !miner.memory.miningSite
        );
        const workingMinerCount =
            roomInfo.miners.length - unassignedMiners.length;
        return set(workingMinerCount - 0.5);
    },
    [roles.hauler]: (roomInfo, set, nudge, bump) => {
        if (!roomInfo.miners.length || !roomInfo.haulers.length) {
            return set(DEFAULT_DEMANDS[roles.hauler]);
        }

        // Reduce proportional to the number of idle haulers
        // Idle meaning empty and not picking up
        const idleHaulers = roomInfo.haulers.filter(
            (hauler) =>
                hauler.store.getCapacity() === hauler.store.getFreeCapacity() &&
                !haulerUtility.getAssignedPickupID(hauler)
        ).length;
        const workingHaulers = roomInfo.haulers.length - idleHaulers;
        const haulerDemand = getRoleDemand(
            roomInfo.room.name,
            roles.hauler
        ).value;
        if (
            idleHaulers >= LOWER_HAULER_THRESHOLD &&
            haulerDemand >= workingHaulers
        ) {
            return nudge(-idleHaulers);
        }

        // We'll consider haulers of the current spawn size
        const currentHaulerSize =
            creepMaker
                .makeHauler(roomInfo.room.energyCapacityAvailable)
                .body.filter((p) => p === CARRY).length * CARRY_CAPACITY;
        const untendedPickups = roomInfo
            .getPickupRequests({
                store: { getCapacity: () => currentHaulerSize },
            })
            .filter(
                (r) => r.assignedHaulers.length * currentHaulerSize < r.amount
            );

        // Initially we won't be able to raise our count
        // because only 1 request will be able to exist
        const threshold = Math.min(
            roomInfo.miners.length,
            RAISE_HAULER_THRESHOLD
        );
        if (untendedPickups.length >= threshold) {
            return bump(1);
        }

        // If there's no problems at all, let's nudge towards our current count
        const target = roomInfo.haulers.length - 0.5;
        return nudge(haulerDemand < target ? 1 : -1);
    },
    [roles.upgrader]: (roomInfo, set, nudge, bump) => {
        if (!roomInfo.miners.length || !roomInfo.haulers.length) {
            return set(DEFAULT_DEMANDS[roles.upgrader]);
        }

        // Priority #1: are upgraders full?
        const upgraders = roomInfo.upgraders;
        const fullUpgraders = upgraders.filter(
            (upgrader) => upgrader.store[RESOURCE_ENERGY]
        );
        const unfilledUpgraders = upgraders.length - fullUpgraders.length;
        if (unfilledUpgraders > LOWER_UPGRADER_THRESHOLD) {
            return nudge(-unfilledUpgraders);
        }

        // Priority #2: do all haulers have dropoff points?
        const fullHaulers = roomInfo.haulers.filter((hauler) => {
            const dropoff = haulerUtility.getAssignedDropoffID(hauler);
            const storageID = roomInfo.room.storage && roomInfo.room.storage.id;
            return (
                hauler.store[RESOURCE_ENERGY] &&
                (!dropoff || dropoff === storageID)
            );
        }).length;
        const threshold =
            storageThresholds[roomInfo.room.controller.level] ||
            Object.values(storageThresholds).slice(-1)[0];
        if (
            fullHaulers > RAISE_UPGRADER_THRESHOLD ||
            roomInfo.room.storage.store[RESOURCE_ENERGY] >= threshold
        ) {
            return nudge(fullHaulers);
        }

        // If there's no problems at all, let's nudge towards our current count
        const upgraderDemand = getRoleDemand(
            roomInfo.room.name,
            roles.upgrader
        ).value;
        const target = roomInfo.upgraders.length - 0.5;
        return nudge(upgraderDemand < target ? 1 : -1);
    },
    [roles.scout]: (roomInfo, set, nudge, bump) => {
        set(1);
    },
    [roles.builder]: (roomInfo, set, nudge, bump) => {
        if (roomInfo.miners.length >= roomInfo.sources.length) {
            if (roomInfo.constructionSites.length > 1) {
                return set(MIN_MAX_DEMAND[roles.builder].max);
            }
            if (roomInfo.constructionSites.length === 1) {
                return set(0.5);
            }
        }
        return set(0);
    },
    [roles.repairer]: (roomInfo, set, nudge, bump) => {
        // TODO //
    },
    [roles.reserver]: (roomInfo, set, nudge, bump) => {
        const reserverCost = getCost(creepMaker.makeReserver().body);
        if (roomInfo.room.energyCapacityAvailable < reserverCost) {
            return set(0);
        }
        const remotePlans = remoteUtility.getRemotePlans(roomInfo.room.name);
        for (const remote of remotePlans) {
            if (!remote.active) {
                continue;
            }
            const room = Game.rooms[remote.room];
            if (
                !room ||
                !room.controller.reservation ||
                room.controller.reservation.username !== ME
            ) {
                return bump(1);
            }
        }
    },
    [roles.mineralMiner]: (roomInfo, set, nudge, bump) => {
        const amount = roomInfo.room.find(STRUCTURE_EXTRACTOR)[0] ? 1 : 0;
        set(amount);
    },
};

/**
 * Here we can subscribe to any important colony events that might
 * impact our spawn demands, like the adding or dropping of remotes.
 */
const { onRemoteAdd, onRemoteDrop } = require("./remote.remoteEvents");
onRemoteAdd.subscribe((roomInfo, remote) => {
    // Bump hauler and miner demand accordingly
    const newHauler = creepMaker.makeHauler(
        roomInfo.room.energyCapacityAvailable
    );
    const carryPerHauler = newHauler.body.filter((p) => p === CARRY).length;
    const neededHaulers = Math.floor(remote.neededCarry / carryPerHauler);
    bumpRoleDemand(roomInfo.room.name, roles.hauler, neededHaulers, true);
    bumpRoleDemand(roomInfo.room.name, roles.miner, 1, true);
});
onRemoteDrop.subscribe((roomInfo, remote) => {
    // Bump hauler and miner demand accordingly
    const newHauler = creepMaker.makeHauler(
        roomInfo.room.energyCapacityAvailable
    );
    const carryPerHauler = newHauler.body.filter((p) => p === CARRY).length;
    const neededHaulers = Math.floor(remote.neededCarry / carryPerHauler);
    bumpRoleDemand(roomInfo.room.name, roles.hauler, -neededHaulers, true);
    bumpRoleDemand(roomInfo.room.name, roles.miner, -1, true);
});

/**
 * Define how our roles should be spawned.
 * Ordered by spawn priority.
 */
const spawnsByRole = {
    [roles.defender]: (roomInfo) => {
        const enemies = roomInfo.getEnemies();
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
                roomInfo.room.energyCapacityAvailable
            );
        }
    },
    [roles.miner]: (roomInfo) => creepMaker.makeMiner(getMinEnergy(roomInfo)),
    [roles.hauler]: (roomInfo) => creepMaker.makeHauler(getMinEnergy(roomInfo)),
    [roles.upgrader]: (roomInfo) =>
        creepMaker.makeUpgrader(roomInfo.room.energyCapacityAvailable),
    [roles.scout]: (roomInfo) => creepMaker.makeScout(),
    [roles.builder]: (roomInfo) =>
        creepMaker.makeBuilder(roomInfo.room.energyCapacityAvailable),
    [roles.repairer]: (roomInfo) =>
        creepMaker.makeRepairer(roomInfo.room.energyCapacityAvailable),
    [roles.reserver]: (roomInfo) => creepMaker.makeReserver(),
    [roles.mineralMiner]: (roomInfo) =>
        creepMaker.makeMineralMiner(roomInfo.room.energyCapacityAvailable),
};

const getMinEnergy = (roomInfo) =>
    roomInfo.miners.length && roomInfo.haulers.length
        ? roomInfo.room.energyCapacityAvailable
        : SPAWN_ENERGY_START;

class SpawnManager {
    run(roomInfo) {
        // Ensure demands exist
        ensureDefaults(roomInfo.room.name);

        // Nudge the spawn demands in whichever direction they need to go in
        // Calculated by the handlers
        for (const role in demandHandlers) {
            const handler = demandHandlers[role];
            handler(
                roomInfo,
                (amount) => setRoleDemand(roomInfo.room.name, role, amount),
                (amount) => nudgeRoleDemand(roomInfo.room.name, role, amount),
                (amount) => bumpRoleDemand(roomInfo.room.name, role, amount)
            );
        }

        // Track our spawning activity
        const inactiveSpawns = [];
        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                this.showVisuals(spawn);
                continue;
            }
            inactiveSpawns.push(spawn);
        }

        // We'll track how many of each role we've spawned this tick to avoid
        // spawning the same creep at multiple spawns if they become open on the same tick
        const spawnedThisTick = {};
        const getNextSpawn = () => {
            // Let's look for our highest priority role that needs a creep
            for (const role in spawnsByRole) {
                const demand = getRoleDemand(roomInfo.room.name, role).value;

                // Here we have to look for the key rather than use the value of the role,
                // since that's what's used in the RoomInfo object
                const matchingRole = Object.keys(roles).find(
                    (r) => roles[r] === role
                );
                const current = roomInfo[matchingRole + "s"].length;
                const thisTick = spawnedThisTick[role] || 0;
                if (demand > current + thisTick) {
                    spawnedThisTick[role] = thisTick + 1;
                    return spawnsByRole[role](roomInfo);
                }
            }
        };

        while (inactiveSpawns.length) {
            const spawn = inactiveSpawns.pop();
            const next = getNextSpawn();
            if (!next) {
                inactiveSpawns.push(spawn);
                break;
            }

            // Save the room responsible for this creep and start spawning
            next.memory.home = roomInfo.room.name;
            spawn.spawnCreep(next.body, next.name, {
                memory: next.memory,
            });
        }

        this.drawOverlay(roomInfo);

        // Track our spawn usage
        return roomInfo.spawns.length - inactiveSpawns.length;
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

    drawOverlay(roomInfo) {
        overlay.addHeading(roomInfo.room.name + "0", "Spawn Demands");
        for (const role in roles) {
            const demand = getRoleDemand(roomInfo.room.name, role).value;
            if (!demand) {
                continue;
            }
            overlay.addColumns(
                roomInfo.room.name + "0",
                role,
                demand.toFixed(4)
            );
        }
    }
}

module.exports = SpawnManager;
