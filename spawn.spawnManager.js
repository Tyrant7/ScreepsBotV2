const { roles, maxCounts } = require("./constants");
const {
    ensureDefaults,
    getRoleDemand,
    setRoleDemand,
    nudgeRoleDemand,
    bumpRoleDemand,
} = require("./spawn.demandHandler");
const haulerUtility = require("./haulerUtility");
const remoteUtility = require("./remoteUtility");
const { getCost } = require("./spawn.spawnUtility");

const creepMaker = require("./spawn.creepMaker");

const RAISE_HAULER_THRESHOLD = 2;
const LOWER_HAULER_THRESHOLD = 1;

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
        const enemies = roomInfo.getEnemies();
        const diff = Math.max(enemies.length - roomInfo.defenders.length, 0);
        set(diff);
    },
    [roles.miner]: (roomInfo, set, nudge, bump) => {
        const amount = roomInfo.getFirstOpenMiningSite() ? 1 : 0;
        bump(amount);
    },
    [roles.hauler]: (roomInfo, set, nudge, bump) => {
        // We'll consider haulers of the current spawn size
        const currentHaulerSize =
            creepMaker
                .makeHauler(roomInfo.room.energyCapacityAvailable)
                .body.filter((p) => p.type === CARRY).length * CARRY_CAPACITY;
        const untendedPickups = roomInfo.getPickupRequests({
            store: { getCapacity: () => currentHaulerSize },
        }).length;
        if (untendedPickups >= RAISE_HAULER_THRESHOLD) {
            return nudge(1);
        }

        const idleHaulers = roomInfo.haulers.filter(
            (hauler) =>
                !haulerUtility.getAssignedDropoffID(hauler) &&
                !haulerUtility.getAssignedPickupID(hauler)
        );
        if (idleHaulers >= LOWER_HAULER_THRESHOLD) {
            return nudge(-1);
        }
    },
    [roles.upgrader]: (roomInfo, set, nudge, bump) => {
        // Priority #1: are upgraders full?
        const upgraders = roomInfo.upgraders;
        const fullUpgraders = upgraders.filter(
            (upgrader) => upgrader.store[RESOURCE_ENERGY]
        );
        const unfilledUpgraders = upgraders.length - fullUpgraders.length;
        if (unfilledUpgraders > LOWER_UPGRADER_THRESHOLD) {
            return nudge(-1);
        }

        // Priority #2: do all haulers have dropoff points?
        const fullHaulers = roomInfo.haulers.filter(
            (hauler) =>
                hauler.store[RESOURCE_ENERGY] &&
                !haulerUtility.getAssignedDropoffID(hauler)
        );
        if (fullHaulers.length > RAISE_UPGRADER_THRESHOLD) {
            return nudge(1);
        }
    },
    [roles.scout]: (roomInfo, set, nudge, bump) => {
        set(1);
    },
    [roles.builder]: (roomInfo, set, nudge, bump) => {
        const amount = roomInfo.constructionSites.length
            ? maxCounts.builder
            : 0;
        set(amount);
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

// Listed in order by spawn priority
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
    [roles.miner]: (roomInfo) =>
        creepMaker.makeMiner(roomInfo.room.energyCapacityAvailable),
    [roles.hauler]: (roomInfo) =>
        creepMaker.makeHauler(roomInfo.room.energyCapacityAvailable),
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
                const demand = getRoleDemand(roomInfo.room.name, role);

                // Here we have to look for the key rather than use the value of the role,
                // since that's what's used in the RoomInfo object
                const matchingRole = Object.keys(roles).find(
                    (r) => roles[r] === role
                );
                const current = roomInfo[matchingRole + "s"].length;
                const thisTick = spawnedThisTick[role] || 0;
                if (demand > current + thisTick) {
                    thisTick[role] = thisTick + 1;
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
}

module.exports = SpawnManager;
