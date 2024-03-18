class SpawnManager {

    /**
     * Spawns the most urgently needed creep for this room from the list of spawn handlers. Spawns none if none are needed.
     * @param {RoomInfo} roomInfo The info for the room to spawn in.
     * @param {*[]} spawnHandlers An array of SpawnHandler objects containing information about each role. Each should implement the following method:
     * - `getNextSpawn(roomInfo)`: Returns an object containing necessary spawn information, including body, name, and memory object.
     */
    run(roomInfo, spawnHandlers) {

        // Iterate over each of our open spawns
        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                this.showVisuals(roomInfo, spawn);
                continue;
            }

            // Find the first handler wanted to spawn
            for (const handler of spawnHandlers) {
                const next = handler.getNextSpawn(roomInfo);
                if (next) {

                    // Save the room responsible for this creep and start spawning
                    next.memory.home = roomInfo.room.name;
                    spawn.spawnCreep(next.body, next.name, { 
                        memory: next.memory,
                    });

                    // To avoid issues with tracking creeps, let's 
                    // limit ourselves to one spawn per tick
                    return;
                }
            }
        }
    }

    showVisuals(roomInfo, spawn) {
        try {
            const spawningCreep = Game.creeps[spawn.spawning.name];
            roomInfo.room.visual.text(
                spawningCreep.name,
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