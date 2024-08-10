const { repairThresholds, roles } = require("./constants");
const { wrap } = require("./debug.profiler");
const { makeMiniDefender } = require("./spawn.creepMaker");

class DefenseManager {
    /**
     * Runs an extremely basic defense system for this room.
     * @param {Colony} colony The colony object associated with the room to run defense logic for.
     */
    run(colony) {
        wrap("base", () => this.defendBase(colony));
        wrap("remotes", () => this.defendRemotes(colony));
    }

    defendBase(colony) {
        const enemies = colony.enemies;
        const towers = colony.structures[STRUCTURE_TOWER];
        if (enemies.length) {
            // We have enemies in our room, but no tower
            // Let's try to safemode
            if (!towers) {
                colony.room.controller.activateSafeMode();
                return;
            }

            // Otherwise, let's shoot at the first enemy
            for (const tower of towers) {
                tower.attack(enemies[0]);
            }
            return;
        }
        if (!towers) return;

        // Let's heal any low health creeps while we're safe
        const lowCreep = colony.room
            .find(FIND_MY_CREEPS)
            .find((c) => c.hits < c.hitsMax);
        if (lowCreep) {
            for (const tower of towers) {
                tower.heal(lowCreep);
            }
            return;
        }

        // Finally, we'll repair roads that are low
        const lowRoads = (colony.structures[STRUCTURE_ROAD] || []).filter(
            (r) => r.hits / r.hitsMax <= repairThresholds[STRUCTURE_ROAD].min
        );
        if (!lowRoads.length) return;

        let i = 0;
        for (const tower of towers) {
            tower.repair(lowRoads[i % lowRoads.length]);
            i++;
        }
    }

    defendRemotes(colony) {
        if (colony.defenders.length >= colony.remoteEnemies.length) return;

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
        colony.addSpawnRequest(
            roles.defender,
            (colony, count) => {
                return makeMiniDefender(
                    Math.ceil(mostFightParts / 4) + 1,
                    colony.room.energyCapacityAvailable
                );
            },
            0
        );
    }
}

module.exports = DefenseManager;
