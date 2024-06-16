class TowerManager {
    /**
     * Runs an extremely basic defense system for this room.
     * @param {RoomInfo} roomInfo The info object associated with the room to run defense logic for.
     */
    run(roomInfo) {
        // Find invaders
        const invaders = roomInfo.room.find(FIND_CREEPS, {
            filter: (c) => !c.my,
        });
        if (!invaders || !invaders.length) {
            return;
        }

        // Let's get our towers to attack the first invader
        const towers = roomInfo.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER,
        });
        for (const tower of towers) {
            tower.attack(invaders[0]);
        }
    }
}

module.exports = TowerManager;
