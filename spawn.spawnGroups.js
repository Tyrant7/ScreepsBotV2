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
 * A spawn group is responsible for spawning creeps that complete a
 * specific goal for our colony, like harvesting energy, transport, or spending.
 */
class SpawnGroup {
    /**
     * Initializes this group with the given spawn profiles.
     * @param {{[role: string]: () => SpawnRequest | undefined}} profiles An an object which maps roles to method which
     * returns a `SpawnRequest` for each creep type in this spawn group.
     */
    constructor(profiles) {
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

            const demand = getRoleDemand(colony, role).value;
            const current = colony[matchingRole + "s"].length;
            const scheduled = spawnsThisTick[role] || 0;
            if (demand > current + scheduled) {
                const makeCreep = this.profiles[role];
                const newCreep = makeCreep(colony);

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

const defense = new SpawnGroup({
    [roles.defender]: (colony) => {
        if (colony.remoteEnemies.length <= colony.defenders.length) return;

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

const production = new SpawnGroup({
    [roles.miner]: (colony) => {
        if (!colony.getFirstOpenMiningSite()) return;
        return creepMaker.makeMiner(
            calculateMinEnergy(colony),
            colony.memory.constructionLevel >= REMOTE_CONTAINER_RCL
        );
    },
    [roles.reserver]: (colony) => {
        if (colony.reservers.length >= colony.remoteRooms.length) return;
        return creepMaker.makeReserver();
    },
    [roles.cleaner]: (colony) => {
        if (colony.invaderCores.length <= colony.cleaners.length) return;
        return creepMaker.makeCleaner(colony.room.energyCapacityAvailable);
    },
});

const transport = new SpawnGroup({
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
        return creepMaker.makeHauler(
            calculateMinEnergy(colony),
            colony.memory.constructionLevel >= REMOTE_ROAD_RCL ? 2 : 1
        );
    },
});

const usage = new SpawnGroup({
    [roles.repairer]: (colony) => {
        if (!colony.remotesNeedingRepair.length || colony.repairers.length)
            return;
        return creepMaker.makeRepairer(colony.room.energyCapacityAvailable);
    },
    [roles.scout]: (colony) => {
        if (colony.scouts.length) return;
        return creepMaker.makeScout();
    },
    [roles.builder]: (colony) => {
        if (
            !colony.constructionSites.length ||
            colony.builders.length >= MIN_MAX_DEMAND[roles.builder].max
        )
            return;
        return creepMaker.makeBuilder(colony.room.energyCapacityAvailable);
    },
    [roles.claimer]: (colony) => {
        if (
            colony.claimers.length >=
            calculateSupportingColonySpawnDemand(colony, roles.claimer)
        )
            return;
        return creepMaker.makeClaimer();
    },
    [roles.colonizerBuilder]: (colony) => {
        if (
            colony.colonizerBuilders.length >=
            calculateSupportingColonySpawnDemand(colony, roles.colonizerBuilder)
        )
            return;
        return creepMaker.makeColonizerBuilder(
            colony.room.energyCapacityAvailable
        );
    },
    [roles.colonizerDefender]: (colony) => {
        if (
            colony.colonizerDefenders.length >=
            calculateSupportingColonySpawnDemand(
                colony,
                roles.colonizerDefender
            )
        )
            return;
        return creepMaker.makeColonizerDefender(
            colony.room.energyCapacityAvailable
        );
    },
    [roles.mineralMiner]: (colony) => {
        if (
            colony.mineralMiners.length ||
            !colony.structures[STRUCTURE_EXTRACTOR]
        )
            return;
        return creepMaker.makeMineralMiner(colony.room.energyCapacityAvailable);
    },
    [roles.upgrader]: (colony) => {
        // Don't really need a condition here;
        // if we need to use up energy, these are our guys
        return creepMaker.makeUpgrader(colony.room.energyCapacityAvailable);
    },
});

//#endregion

const groups = [defense, production, transport, usage];
const getSortedGroups = (colony) => {
    // TODO
};

module.exports = {
    groups,
    getSortedGroups,
};
