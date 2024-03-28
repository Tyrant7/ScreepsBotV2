class SpawnManager {

    /**
     * Spawns the most urgently needed creep for this room from the list of spawn handlers. Spawns none if none are needed.
     * @param {RoomInfo} roomInfo The info for the room to spawn in.
     * @param {EconomyHandler} economyHandler The economy handler. 
     */
    run(roomInfo, economyHandler) {

        // Visuals
        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                this.showVisuals(roomInfo, spawn);
                continue;
            }
        }

        // To avoid issues with tracking creeps, 
        // limit ourselves to one spawn per tick
        const firstActiveSpawn = roomInfo.spawns.find((spawn) => !spawn.spawning);
        if (!firstActiveSpawn) {
            return;
        }

        const next = economyHandler.run(roomInfo);
        if (next) {
            // Save the room responsible for this creep and start spawning
            next.memory.home = roomInfo.room.name;
            firstActiveSpawn.spawnCreep(next.body, next.name, { 
                memory: next.memory,
            });
        }
    }

    showVisuals(roomInfo, spawn) {
        try {
            const spawningCreep = Game.creeps[spawn.spawning.name];
            const displayName = spawningCreep.name.split(' ')[0] + " " + spawningCreep.name.split(' ')[2];
            roomInfo.room.visual.text(
                displayName,
                spawn.pos.x,
                spawn.pos.y - 1,
                { align: "center", opacity: 0.8 });
        }
        catch (e) {
            console.log("Error when showing spawn visual: " + e);
        }
    }
}

module.exports = SpawnManager;