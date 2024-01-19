class SpawnManager {

    /**
     * Spawns the most urgently needed creep for this room from the list of spawn infos. Spawns none if none are needed.
     * @param {RoomInfo} roomInfo The info for the room to spawn in.
     * @param {*[]} spawnInfos An array of SpawnInfo objects containing information about each role. Each should implement the following method:
     * - `getNextSpawn(roomInfo)`: Returns an object containing necessary spawn information, including body, name, and memory object.
     */
    run(roomInfo, spawnInfos) {

        // Find the first spawn info that doesn't meet its requirements
        for (const info of spawnInfos) {
            const next = info.getNextSpawn(roomInfo);
            if (next && next.body.length) {
                this.trySpawnCreep(roomInfo, next);
                break;
            }
        }

        // Visuals!
        this.showSpawnVisuals(roomInfo);
    }

    /**
     * Spawns a creep matching the provided data at the first spawn available in this room.
     * @param {RoomInfo} roomInfo Info for the room to spawn in.
     * @param {*} data Meta data about the spawning creep.
     */
    trySpawnCreep(roomInfo, data) {

        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                continue;
            }

            // Save the room responsible for this creep
            data.memory.home = roomInfo.room.name;
            const result = spawn.spawnCreep(data.body, data.name, { 
                memory: data.memory
            });

            // Success!
            if (result === OK) {
                break;
            }
        }
    }

    /**
     * Shows some basic visuals for each spawn that is currently spawning in the specified room.
     * @param {RoomInfo} roomInfo Info for the room to show visuals for.
     */
    showSpawnVisuals(roomInfo) {
        for (const spawn of roomInfo.spawns) {
            // Show some visuals
            if (spawn.spawning) {
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
    }
}

module.exports = SpawnManager;