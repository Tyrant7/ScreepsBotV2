const { repairThresholds } = require("./constants");

class DefenseManager {
    /**
     * Runs an extremely basic defense system for this room.
     * @param {Colony} colony The colony object associated with the room to run defense logic for.
     */
    run(colony) {
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
            (r) => r.hits / r.hitsMax <= repairThresholds[STRUCTURE_ROAD]
        );
        if (!lowRoads.length) return;

        let i = 0;
        for (const tower of towers) {
            tower.repair(lowRoads[i % lowRoads.length]);
            i++;
        }
    }
}

module.exports = DefenseManager;
