class DefenseManager {
    /**
     * Runs an extremely basic defense system for this room.
     * @param {Colony} colony The colony object associated with the room to run defense logic for.
     */
    run(colony) {
        const enemies = colony.enemies;
        if (!enemies.length) return;

        const towers = colony.structures[STRUCTURE_TOWER];
        if (!towers) {
            // We have enemies in our room, but no tower
            // Let's try to safemode
            colony.room.controller.activateSafeMode();
            return;
        }

        // Otherwise, let's shoot at the first enemy
        for (const tower of towers) {
            tower.attack(enemies[0]);
        }
    }
}

module.exports = DefenseManager;
