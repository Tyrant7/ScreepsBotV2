const { getAllMissions } = require("./mission.missionUtility");
const overlay = require("./debug.overlay");
const { getRelevantSpawnRequests } = require("./spawn.spawnGroups");

class SpawnManager {
    run(colony) {
        // Find all of our inactive spawns
        const inactiveSpawns = [];
        for (const spawn of colony.structures[STRUCTURE_SPAWN]) {
            if (spawn.spawning) {
                this.showVisuals(spawn);
                continue;
            }
            inactiveSpawns.push(spawn);
        }
        const spawnRequests = getRelevantSpawnRequests(
            colony,
            inactiveSpawns.length
        );
        while (inactiveSpawns.length && spawnRequests.length) {
            // We'll get our next spawning creep
            const next = spawnRequests.pop();
            if (!next) break;

            // Once we've found one, let's get the spawn that will handle that creep
            const spawn = inactiveSpawns[0];

            // Save the room responsible for this creep and spawn it
            next.memory.home = colony.room.name;
            const result = spawn.spawnCreep(next.body, next.name, {
                memory: next.memory,
            });

            // If we succesfully spawned, let's mark this spawn as active and record the creep type that we've spawned
            if (result === OK) {
                inactiveSpawns.shift();

                // We'll also let all other colonies know that we've spawned this creep if it's for a mission
                if (next.memory.mission) {
                    getAllMissions()[
                        next.memory.mission
                    ].creepNamesAndRoles.push({
                        name: next.name,
                        role: next.memory.role,
                    });
                }
            }
            // Let's wait until we have enough energy
            else if (result === ERR_NOT_ENOUGH_ENERGY) break;
        }
    }

    /**
     * Shows visuals for this spawn, if spawning.
     * @param {StructureSpawn} spawn The spawn to show visuals for.
     */
    showVisuals(spawn) {
        try {
            const spawningCreep = Game.creeps[spawn.spawning.name];
            const displayName =
                spawningCreep.name.split(" ")[0] +
                " " +
                spawningCreep.name.split(" ")[2];
            Game.rooms[spawn.pos.roomName].visual.text(
                displayName,
                spawn.pos.x,
                spawn.pos.y - 1,
                { align: "center", opacity: 0.6 }
            );
            Game.rooms[spawn.pos.roomName].visual.text(
                spawn.spawning.remainingTime,
                spawn.pos.x,
                spawn.pos.y + 0.2,
                {
                    align: "center",
                    opacity: 0.8,
                }
            );
        } catch (e) {
            console.log("Error when showing spawn visual: " + e);
        }
    }

    drawOverlay(colony, profileNames) {
        overlay.addHeading(colony.room.name + "_a", "Next spawns");
        for (const profile of profileNames) {
            overlay.addColumns(colony.room.name + "_a", profile, "");
        }
    }
}

module.exports = SpawnManager;
