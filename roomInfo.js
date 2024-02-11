// TODO //
// Consider:
// This class is clunky to pass around everywhere
// What about just extending the base Room prototype to include all of these things?


class RoomInfo {

    constructor(room) {
        this.room = room;

        // Find all creeps that this room is responsible for, not just ones in it
        this.creeps = Object.values(Game.creeps).filter((c) => c.memory.home === room.name);

        this.workers = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.worker);
        this.miners = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.miner);
        this.haulers = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.hauler);
        this.scouts = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.scout);

        this.remoteBuilders = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.remoteBuilder);
        this.remoteMiners = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.remoteMiner);
        this.remoteHaulers = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.remoteHauler);
        this.reservers = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.reserver);

        this.defenders = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.defender);

        this.spawns = room.find(FIND_MY_SPAWNS);

        this.openSourceSpots = room.find(FIND_SOURCES).reduce(function(total, s) {
            const p = s.pos;
                                                           // No constant that I could find for this terrain type, unfortunately vv
            const lookResults = room.lookForAtArea(LOOK_TERRAIN, p.y-1, p.x-1, p.y+1, p.x+1, true).filter((t) => t.terrain === "wall");
            return total + (9 - lookResults.length);
        }, 0);

        this.remoting = room.controller && room.controller.my && room.controller.level >= 4;
    }

    /**
     * Finds the sources in this room and caches them for future calls.
     * @returns An array of Source objects.
     */
    getSources() {
        if (this.sources) {
            return this.sources;
        }
        return this.room.find(FIND_SOURCES);
    }

    /**
     * Finds all sources in this room that have not yet been reserved by miners.
     * @returns An array of Source objects.
     */
    getUnreservedSources() {
        const reservedIDs = this.miners.map((miner) => miner.memory.sourceID);
        return this.getSources().filter((source) => {
            return !reservedIDs.includes(source.id);
        });
    }

    getMaxIncome() {
        return this.getSources().reduce((total, source) => total + (source.energyCapacity / ENERGY_REGEN_TIME), 0);
    }

    getGrossIncome() {
        const income = this.miners.reduce((total, curr) => total + curr.body.filter((part) => part.type === WORK).length * HARVEST_POWER, 0);
        return Math.min(income, this.getMaxIncome());
    }

    getEnemies() {
        if (this.enemies) {
            return this.enemies;
        }
        this.enemies = [];

        const base = Memory.bases[this.room.name];
        if (!base) {
            return this.enemies;
        }

        const rooms = base.remotes.map((r) => r.room);
        for (const roomName of rooms) {
            const room = Game.rooms[roomName];
            if (!room) {
                continue;
            }
            const enemies = room.find(FIND_HOSTILE_CREEPS);
            this.enemies.push(enemies);
        }
        return this.enemies;
    }
}

module.exports = RoomInfo;