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
        for (const tower of towers) {
            tower.heal(lowCreep);
        }
    }
}

module.exports = DefenseManager;
