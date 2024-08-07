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

            // If we're supporting another colony, let's assign this creep to it
            // Simply find the first colony missing one of these creeps
            const supportingColony =
                colony.memory.supporting && colony.memory.supporting.length
                    ? colony.memory.supporting.find(
                          (s) =>
                              Memory.newColonies[s].spawnDemands[
                                  next.memory.role
                              ] &&
                              Memory.newColonies[s].spawnDemands[
                                  next.memory.role
                              ] >
                                  Memory.newColonies[
                                      s
                                  ].creepNamesAndRoles.filter(
                                      (c) => c.role === next.memory.role
                                  ).length
                      )
                    : null;
            if (supportingColony) {
                next.memory.expansionTarget = supportingColony;
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

                // We'll also let all other colonies know that we've spawned this creep
                // if it's a surrogate spawn for another colony trying to get on its feet
                if (Memory.newColonies[supportingColony]) {
                    Memory.newColonies[
                        supportingColony
                    ].creepNamesAndRoles.push({
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
