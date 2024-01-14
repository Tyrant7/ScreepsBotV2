const WorkerSpawnInfo = require("./workerSpawnInfo");

class SpawnManager {

    /**
     * Spawns the most urgently needed creep for this room from the list of spawn infos. Spawns none if none are needed.
     * @param {RoomInfo} roomInfo The info for the room to spawn in.
     * @param {*[]} spawnInfos An array of SpawnInfo objects containing information about each role. Each should implement the following methods:
     * - `getPriority(roomInfo)`: which returns the priority that the given role is spawned in the given room.
     * - `make(roomInfo)`: which returns a new creep body along with the meta data needed to spawn the creep.
     * Meta data is an object which includes properties for the creep's body, cost, name, and memory object.
     */
    run(roomInfo, spawnInfos) {

        // Don't try to spawn in rooms that aren't ours
        if (!roomInfo.spawns || roomInfo.spawns.length === 0) {
            return;
        }

        // Get spawn priorities for each role
        const priorities = {};
        for (const spawn in spawnInfos) {
            priorities[spawn] = spawnInfos[spawn].getPriority(roomInfo);
        }

        // Find index with highest priority
        const highestPriority = 
            Object.keys(priorities).reduce((key, highestKey) => priorities[key] > priorities[highestKey] ? key : highestKey);

        // Create new creep of the highest priority role
        const next = spawnInfos[highestPriority].make(roomInfo);

        // Spawn it
        this.trySpawnCreep(roomInfo, next);

        // Visuals!
        this.showSpawnVisuals(roomInfo);
    }

    /**
     * Spawns a creep matching the provided data at the first spawn available in this room.
     * @param {RoomInfo} roomInfo Info for the room to spawn in.
     * @param {*} data Meta data about the spawning creep.
     */
    trySpawnCreep(roomInfo, data) {

        // Spawn next from queue for each non-busy spawn in the room
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