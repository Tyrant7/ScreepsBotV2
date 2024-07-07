class TowerManager {
    /**
     * Runs an extremely basic defense system for this room.
     * @param {Colony} colony The colony object associated with the room to run defense logic for.
     */
    run(colony) {
        // Find invaders
        const invaders = colony.room.find(FIND_CREEPS, {
            filter: (c) => !c.my,
        });
        if (!invaders || !invaders.length) {
            return;
        }

        // Let's get our towers to attack the first invader
        const towers = colony.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER,
        });
        for (const tower of towers) {
            tower.attack(invaders[0]);
        }
    }
}

module.exports = TowerManager;
