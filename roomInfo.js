const remoteUtility = require("remoteUtility");

class RoomInfo {

    constructor(room) {
        this.room = room;

        // Find all creeps that this room is responsible for, not just ones in it
        this.creeps = Object.values(Game.creeps).filter((c) => c.memory.home === room.name);

        // Dynamically intialize an array for each role
        for (const role in CONSTANTS.roles) {
            const propName = role + "s";
            this[propName] = [];
        }

        // Map each role's string name found on creeps to it's code name
        const roleToArrayMap = {};
        Object.keys(CONSTANTS.roles).forEach((roleName) => {
            roleToArrayMap[CONSTANTS.roles[roleName]] = this[roleName + "s"];
        });

        // Push each creep to their matching array
        this.creeps.forEach((creep) => {
            const array = roleToArrayMap[creep.memory.role];
            if (array) {
                array.push(creep);
            }
        });

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

    getMaxIncome() {
        return this.getSources().reduce((total, source) => total + (source.energyCapacity / ENERGY_REGEN_TIME), 0);
    }

    getGrossIncome() {
        const income = this.miners.reduce((total, curr) => total + curr.body.filter((part) => part.type === WORK).length * HARVEST_POWER, 0);
        return Math.min(income, this.getMaxIncome());
    }

    /**
     * Finds enemies in remotes of this room and caches them.
     * @returns {Creep[]} A list of enemy creeps in this room's remotes.
     */
    getEnemies() {
        if (this.enemies) {
            return this.enemies;
        }
        this.enemies = [];

        const base = Memory.bases[this.room.name];
        if (!base) {
            return this.enemies;
        }

        for (const roomName in base.remotes) {
            const room = Game.rooms[roomName];
            if (!room) {
                continue;
            }
            const enemies = room.find(FIND_HOSTILE_CREEPS);
            this.enemies.push(...enemies);
        }
        return this.enemies;
    }

    getUpgraderContainer() {
        const containerPos = Memory.bases[this.room.name].upgraderContainer;
        return this.room.lookForAt(LOOK_STRUCTURES, containerPos.x, containerPos.y).find(
            (s) => s.structureType === STRUCTURE_CONTAINER);
    }

    //
    // Remote Management Logic Below
    //


    /**
     * Gets an array of all mining sites for this room.
     * @param {boolean} onlyLocal Should this consider remote mining sites as well?
     * @returns An array of objects, each containing some data about the mining site:
     * - The position of the mining site (place to stand).
     * - The ID of the source to mine.
     */
    getMiningSites(onlyLocal = false) {
        if (this.cachedMiningSpots) {
            return this.cachedMiningSpots;
        }

        const miningSpots = [];

        // Get the mining sites for this room
        const base = Memory.bases[this.room.name];
        for (const key in base.minerContainers) {
            miningSpots.push({
                pos: base.minerContainers[key],
                sourceID: key,
            });
        }

        if (onlyLocal) {
            return miningSpots;
        }

        // Get the mining sites for remote rooms
        const remotePlans = remoteUtility.getRemotePlans(this.room.name);
        const allMiningSites = [];
        if (remotePlans) {
            for (const remote in remotePlans) {
                allMiningSites.push(...remotePlans[remote].miningSites);
            }
        }

        // Add 'em
        for (const miningSite of allMiningSites) {
            miningSpots.push({
                pos: miningSite.pos,
                sourceID: miningSite.sourceID,
            });
        }

        // Cache in case of multiple requests this tick
        this.cachedMiningSpots = miningSpots;
        return miningSpots;
    }

    /**
     * Gets the first unreserved mining site.
     * @param {boolean} onlyLocal Should this consider remote mining sites as well?
     * @returns An object containing some data about the mining site:
     * - The position of the mining site (place to stand).
     * - The ID of the source to mine.
     */
    getFirstUnreservedMiningSite(onlyLocal = false) {
        // Sites are conveniently already ordered by priority
        const sites = this.getMiningSites(onlyLocal);

        // Find the first site where no miner has reserved
        return sites.find((site) => !this.miners.find((m) => m.memory.miningSite && m.memory.miningSite.sourceID === site.sourceID));
    }

    /**
     * Gets an array of all energy pickup points for this room, including in remotes.
     * Does not include storage as that will only be used under special conditions defined by creep roles individually.
     * @returns An array of objects, each containing some data about the pickup point:
     * - The position of the pickup point.
     * - The amount of energy.
     * - The fillrate of the pickup, positive for containers, negative for dropped energy.
     * - The ticks until this pickup point will be affected by the fillrate.
     *   Used when a miner has been assigned to a container but hasn't yet reached the mining site.
     * - The ID of the pickup object.
     */
    getEnergyPickupPoints() {
        if (this.cachedEnergyPickupPoints) {
            return this.cachedEnergyPickupPoints;
        }

        // Declare a reusable function that adds all dropped energy in a particular room that we can see
        const pickupPoints = [];
        function addDroppedPoints(room) {
            room.find(FIND_DROPPED_RESOURCES, { filter: { resourceType: RESOURCE_ENERGY }}).forEach((drop) => {
                pickupPoints.push({
                    pos: drop.pos,
                    amount: drop.amount,
                    fillrate: -Math.ceil(drop.amount / ENERGY_DECAY),
                    ticksUntilBeginFilling: 0, 
                    id: drop.id,
                });
            });
        }

        // Add all mining sites as valid pickup points
        for (const site of this.getMiningSites()) {
            const room = Game.rooms[site.pos.roomName];
            if (!room) {
                continue;
            }
            const container = room.lookForAt(LOOK_STRUCTURES, site.pos.x, site.pos.y).find((s) => s.structureType === STRUCTURE_CONTAINER);
            if (!container) {
                continue;
            }

            // Calculate the fillrate of this container
            const assignedMiner = this.miners.find((m) => m.memory.miningSite && m.memory.miningSite.sourceID === site.sourceID);
            const fillrate = assignedMiner
                ? (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME)
                // Container won't fill if we don't have a miner assigned to it
                : 0;
            const ticksUntil = assignedMiner 
                ? assignedMiner.pos.getRangeTo(site.pos) 
                : 0;

            pickupPoints.push({
                pos: site.pos,
                amount: container.store[RESOURCE_ENERGY],
                fillrate: fillrate,
                ticksUntilBeginFilling: ticksUntil,
                id: container.id,
            });
        }

        // Add the storage, but keep its capacity above our minimum threshold
        const storage = this.room.storage;
        if (storage) {
            pickupPoints.push({
                pos: storage.pos,
                amount: Math.max(0, storage.store[RESOURCE_ENERGY] - CONSTANTS.minEnergyStored),
                fillrate: 0,
                ticksUntilBeginFilling: 0,
                id: storage.id,
            });
        }

        // Add dropped energy
        addDroppedPoints(this.room);

        // Now let's iterate over each remote and add pickup points in them too as long as we can see the room
        const remotePlans = remoteUtility.getRemotePlans(this.room.name);
        if (remotePlans) {
            for (const key in remotePlans) {
                const remote = Game.rooms[key];
                if (!remote) {
                    continue;
                }
                addDroppedPoints(remote);
            }
        }

        // Cache in case of multiple requests this tick
        this.cachedEnergyPickupPoints = pickupPoints;
        return pickupPoints;
    }

    /**
     * Gets an array of all energy dropoff points for this room, including in remotes.
     * @returns An array of objects, each containing some data about the dropoff point:
     * - The position of the dropoff point.
     * - The amount of energy needed.
     * - The ID of the dropoff object.
     */
    getEnergyDropoffPoints() {
        if (this.cachedEnergyDropoffPoints) {
            return this.cachedEnergyDropoffPoints;
        }

        const dropoffPoints = [];

        // Add all extensions, spawns, and towers
        this.room.find(FIND_MY_STRUCTURES, { filter: (s) => {
            return s.structureType == STRUCTURE_EXTENSION || 
                   s.structureType == STRUCTURE_SPAWN || 
                   s.structureType == STRUCTURE_TOWER;
        }}).forEach((structure) => {
            dropoffPoints.push({
                pos: structure.pos,
                amount: structure.store.getFreeCapacity(RESOURCE_ENERGY),
                id: structure.id,
            });
        });

        // Also add the upgrader's container, if one exists
        const upgraderContainer = this.getUpgraderContainer();
        if (upgraderContainer) {
            dropoffPoints.push({
                pos: upgraderContainer.pos,
                amount: upgraderContainer.store.getFreeCapacity(),
                id: upgraderContainer.id,
            });
        }

        // Finally, add the storage, if one exists
        const storage = this.room.storage;
        if (storage) {
            dropoffPoints.push({
                pos: storage.pos,
                amount: storage.store.getFreeCapacity(),
                id: storage.id,
            });
        }

        // Cache in case of multiple requests this tick
        this.cachedEnergyDropoffPoints = dropoffPoints;
        return dropoffPoints;
    }
}

module.exports = RoomInfo;