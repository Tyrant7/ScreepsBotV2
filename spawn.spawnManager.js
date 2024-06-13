const { roles } = require("./constants");
const {
    ensureDefaults,
    getRoleDemand,
    bumpRoleDemand,
    updateDemands,
} = require("./spawn.demandHandler");

const PRIORITIES = [
    [roles.defender],
    [roles.miner],
    [roles.hauler],
    [roles.upgrader],
    [roles.scout],
    [roles.builder],
    [roles.repairer],
    [roles.reserver],
    [roles.mineralMiner],
];

class SpawnManager {
    run(roomInfo) {
        // Ensure demands exist
        ensureDefaults(roomInfo.room.name);

        // Nudge the spawn demands in whichever direction they need to go in
        // Calculated by the handlers
        // Should have one handler per role
        const handlers = {};
        updateDemands(roomInfo.room.name, handlers);

        // Track our spawning activity
        const inactiveSpawns = [];
        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                this.showVisuals(spawn);
                continue;
            }
            inactiveSpawns.push(spawn);
        }

        // We'll track how many of each role we've spawned this tick to avoid
        // spawning the same creep at multiple spawns if they become open on the same tick
        const spawnedThisTick = {};
        const getNextSpawn = () => {
            // Let's look for our highest priority role that needs a creep
            for (const role of PRIORITIES) {
                const demand = getRoleDemand(roomInfo.room.name, role);
                const current = roomInfo[role + "s"].length;
                const thisTick = spawnedThisTick[role] || 0;
                if (demand > current + thisTick) {
                    thisTick[role] = thisTick + 1;
                    return this.spawnByRole(role);
                }
            }
        };

        while (inactiveSpawns.length) {
            const spawn = inactiveSpawns.pop();
            const next = getNextSpawn();
            if (!next) {
                break;
            }

            // Save the room responsible for this creep and start spawning
            next.memory.home = roomInfo.room.name;
            spawn.spawnCreep(next.body, next.name, {
                memory: next.memory,
            });
        }

        // Track our spawn usage
        return roomInfo.spawns.length - inactiveSpawns.length;

        // when a large event happens, like adding or dropping a remote
        // we will perform a "bump" for spawn demand of that role
        // and freeze nudging until for X ticks
        // where X is equal to math.abs(number of ticks to spawn 1 creep of role * bumped amount)
    }

    spawnByRole(role) {
        return {};
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
}

module.exports = SpawnManager;
