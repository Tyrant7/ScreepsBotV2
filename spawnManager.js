const creepMaker = requier("creepMaker");

// This is the order we'll handle spawns in
// All spawns must be met from each handler before moving on to the next
const spawnOrder = [
    new CrashSpawnHandler(),
    new DefenseSpawnHandler(),
    new BaseSpawnHandler(),
    new RemoteSpawnHandler(),
];

class SpawnManager {

    /**
     * Handles spawning the next needed creep, and returns current spawn usage.
     * @param {RoomInfo} roomInfo The room to spawn for.
     * @returns {number} The current spawn usage expressed as a decimal between 0 and 1.
     */
    trackSpawns(roomInfo) {

        // Handle our next spawn
        const inactiveSpawns = roomInfo.spawns.filter((s) => !s.spawning);
        this.handleNextSpawn(roomInfo, inactiveSpawns);

        // Visuals
        for (const spawn of roomInfo.spawns) {
            if (spawn.spawning) {
                this.showVisuals(roomInfo, spawn);
            }
        }

        // Track our spawn usage
        return (roomInfo.spawns.length - inactiveSpawns.length) / roomInfo.spawns.length;
    }

    handleNextSpawn(roomInfo, inactiveSpawns) {

        // Limit ourselves to spawning one creep per tick to avoid issues with tracking need
        const nextSpawn = inactiveSpawns[0];
        if (!nextSpawn) {
            return;
        }

        for (const spawnHandler of spawnOrder) {
            const next = spawnHandler.getNextSpawn(roomInfo);
            if (next) {
                // Save the room responsible for this creep and start spawning
                next.memory.home = roomInfo.room.name;
                nextSpawn.spawnCreep(next.body, next.name, { 
                    memory: next.memory,
                });
                break;
            }
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

// #region Spawn Handlers

class SpawnHandler {
    getNextSpawn(roomInfo) {
        throw new Error("Must implement `getNextSpawn()`!");
    }
}

class CrashSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        
        // Let's ensure our colony has met some basic requirements before spawning additional creeps
        // In this case we should be good to restart now
        if (roomInfo.miners.length >= 1 && roomInfo.haulers.length >= 1) {
            return;
        }

        // If we have a miner but no haulers, let's spawn a hauler to restock quickly
        if (roomInfo.miners.length) {

            // Make sure we can afford any hauler at all
            const hauler = creepMaker.makeHauler(CONSTANTS.maxHaulerlevel, roomInfo.energyAvailable);
            if (hauler && hauler.body.length) {
                return hauler;
            }
        }
        // We have no miner
        else {
            const miner = creepMaker.makeRecoveryMiner(roomInfo.room.energyCapacityAvailable);
            if (miner) {
                return miner;
            }
        }
    }
}

class BaseSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        
    }
}   

class RemoteSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        
    }
}

class DefenseSpawnHandler extends SpawnHandler {
    getNextSpawn(roomInfo) {
        const enemies = roomInfo.getEnemies();
        if (enemies.length > roomInfo.defenders.length) {

            // Find our strongest enemy
            const mostFightParts = enemies.reduce((strongest, curr) => {
                const fightParts = curr.body.filter((p) => p.type === RANGED_ATTACK || p.type === ATTACK || p.type === HEAL).length;
                return fightParts > strongest ? fightParts : strongest;
            }, 0);

            // Make an appropriately sized defender
            // i.e. one level larger in size
            return creepMaker.makeMiniDefender(Math.ceil(mostFightParts / 4) + 1, roomInfo.room.energyCapacityAvailable);
        }
    }
}

//#endregion

module.exports = SpawnManager;