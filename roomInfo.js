class RoomInfo {

    constructor(room) {
        this.room = room;
        this.creeps = this.room.find(FIND_MY_CREEPS);

        this.workers = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.worker);
        this.miners = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.miner);

        this.spawns = this.room.find(FIND_MY_SPAWNS);

        this.openSourceSpots = room.find(FIND_SOURCES).reduce(function(total, s) {

            const p = s.pos;
                                                           // No constant that I could find for this terrain type, unfortunately vv
            const lookResults = room.lookForAtArea(LOOK_TERRAIN, p.y-1, p.x-1, p.y+1, p.x+1, true).filter((t) => t.terrain === "wall");
            return total + (9 - lookResults.length);
        }, 0);
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

    getCachedSourcePaths() {
        // TODO //
    }

    getMaxIncome() {
        return this.getSources().reduce((total, source) => total + (source.energyCapacity / ENERGY_REGEN_TIME), 0);
    }

    getGrossIncome() {
        const income = this.miners.reduce((total, curr) => total + curr.body.filter((part) => part.type === WORK).length * HARVEST_POWER, 0);
        return Math.min(income, this.getMaxIncome());
    }
}

module.exports = RoomInfo;