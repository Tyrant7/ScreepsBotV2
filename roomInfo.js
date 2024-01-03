// TODO //
// Consider:
// This class is clunky to pass around everywhere
// What about just extending the base Room prototype to include all of these things?


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

        // If this room is a remote, the dependant will be the ID of the adjacent non-remote room
        // if this room isn't a remote, this is will be it's own ID
        // TODO //
        // Better implementation than this to actually account for remotes and not just owned rooms
        if (room.controller.my) {
            this.dependant = room.name;
        }
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

    /**
     * Is this room owned or important to us?
     * @returns The name of the dependant for this room: can be this own room's name, or the organizer if this room is a remote.
     * Undefined if this room isn't important to us.
     */
    isRemoteOrDependant() {
        return this.dependant;
    }
}

module.exports = RoomInfo;