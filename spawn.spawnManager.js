const { getAllMissions } = require("./mission.missionUtility");
const overlay = require("./debug.overlay");
const { getSortedGroups } = require("./spawn.spawnGroups");

class SpawnManager {
    run(colony) {
        const orderedGroups = getSortedGroups(colony);
        this.drawOverlay(
            colony,
            orderedGroups.map((g) => g.debugName)
        );

        // Find all of our inactive spawns
        const inactiveSpawns = [];
        for (const spawn of colony.structures[STRUCTURE_SPAWN]) {
            if (spawn.spawning) {
                this.showVisuals(spawn);
                continue;
            }
            inactiveSpawns.push(spawn);
        }

        // We'll track which creeps we've scheduled to be spawned this tick to avoid
        // spawning the same creep at multiple spawns if they become open on the same tick
        const spawnsThisTick = {};
        while (inactiveSpawns.length && orderedGroups.length) {
            // We'll get our next spawning creep
            const nextGroup = orderedGroups[0];
            const next = nextGroup.getNextSpawn(colony, spawnsThisTick);
            if (!next) {
                orderedGroups.shift();
                continue;
            }

            // Once we've found one, let's get the spawn that will handle that creep
            const spawn = inactiveSpawns[0];

            // If we're supporting a mission, let's assign this creep to it
            // Simply find the first mission missing one of these creeps
            const supportingMission =
                colony.memory.missions && colony.memory.missions.length
                    ? colony.memory.missions.find((s) => {
                          const mission = getAllMissions()[s];
                          if (!mission.spawnDemands[next.memory.role])
                              return false;
                          return (
                              mission.spawnDemands[next.memory.role] >
                              mission.creepNamesAndRoles.filter(
                                  (c) => c.role === next.memory.role
                              ).length
                          );
                      })
                    : null;
            if (supportingMission) {
                next.memory.mission = supportingMission;
            }

            // Save the room responsible for this creep and spawn it
            next.memory.home = colony.room.name;
            const result = spawn.spawnCreep(next.body, next.name, {
                memory: next.memory,
            });

            // If we succesfully spawned, let's mark this spawn as active and record the creep type that we've spawned
            if (result === OK) {
                inactiveSpawns.shift();
                spawnsThisTick[next.memory.role] =
                    (spawnsThisTick[next.memory.role] || 0) + 1;

                // We'll also let all other colonies know that we've spawned this creep if it's for a mission
                const mission = getAllMissions()[supportingMission];
                if (mission) {
                    mission.creepNamesAndRoles.push({
                        name: next.name,
                        role: next.memory.role,
                    });
                }
            } else if (result === ERR_NOT_ENOUGH_ENERGY) {
                // Let's wait until we have enough energy
                break;
            }
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
