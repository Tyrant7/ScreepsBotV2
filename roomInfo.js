class RoomInfo extends Room {

    constructor() {
        this.creeps = this.find(FIND_MY_CREEPS);
        this.miners = this.creeps.filter((creep) => creep.memory.role === CONSTANTS.roles.miner);

        this.spawns = this.find(FIND_MY_SPAWNS);
    }

    /**
     * Finds the sources in this room and caches them for future calls.
     * @returns An array of Source objects.
     */
    getSources() {
        if (this.sources) {
            return this.sources;
        }
        return this.find(FIND_SOURCES);
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
        return this.getSources.reduce((total, source) => total + (source.energyCapacity / ENERGY_REGEN_TIME), 0);
    }
}