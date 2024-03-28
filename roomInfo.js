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
        this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
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

    // #region Maintenance
    
    /**
     * Finds all structures wanted by this room, including remotes.
     * @returns An array of all planned structures currently visible and wanted by this room.
     */
    getWantedStructures() {
        if (this.wantedStructures) {
            return this.wantedStructures;
        }

        const structures = this.room.find(FIND_STRUCTURES);
        const remotePlans = remoteUtility.getRemotePlans(this.room.name);
        for (const roomName in remotePlans) {
            if (!remotePlans[roomName].active) {
                continue;
            }
            if (Game.rooms[roomName]) {
                structures.push(...Game.rooms[roomName].find(FIND_STRUCTURES, { 
                    filter: (s) => remoteUtility.isStructurePlanned(this.room.name, s.pos, s.structureType)
                }));
            }
        }

        this.wantedStructures = structures;
        return structures;
    }

    // #endregion

    // #region Construction

    /**
     * Finds all unbuilt planned structures in this room's remotes.
     * @returns An array of objects, each with a position and STRUCTURE_ constant for the structure intended to be built.
     */
    getConstructionQueue() {
        if (this.constructionQueue) {
            return this.constructionQueue;
        }

        // Track all unbuilt structues in our remotes
        const unbuilt = [];

        const remotes = remoteUtility.getRemotePlans(this.room.name);
        for (const roomName in remotes) {
            const remote = remotes[roomName];
            if (!remote.active) {
                continue;
            }

            // Start with containers
            const room = Game.rooms[roomName];
            if (room) {
                remote.miningSites.forEach((miningSite) => {
                    const container = miningSite.pos;
                    const existingContainer = room.lookForAt(LOOK_STRUCTURES, container.x, container.y).find((s) => s.structureType === STRUCTURE_CONTAINER);
                    if (!existingContainer) {
                        unbuilt.push({ pos: container, type: STRUCTURE_CONTAINER });
                    }
                });
            }

            // Then roads
            remote.roads.forEach((road) => {
                const room = Game.rooms[road.roomName];
                if (room) {
                    const existingRoad = room.lookForAt(LOOK_STRUCTURES, road.x, road.y).find((s) => s.structureType === STRUCTURE_ROAD);
                    if (!existingRoad) {
                        unbuilt.push({ pos: road, type: STRUCTURE_ROAD });
                    }
                }
            });
        }

        this.constructionQueue = unbuilt;
        return unbuilt;
    }

    // #endregion

    // #region Mining

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
                if (!remotePlans[remote].active) {
                    continue;
                }
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

    // #endregion

    // #region Hauling

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
            room.find(FIND_TOMBSTONES).filter((t) => t.store[RESOURCE_ENERGY]).forEach((tombstone) => {
                pickupPoints.push({
                    pos: tombstone.pos,
                    amount: tombstone.store[RESOURCE_ENERGY],
                    fillrate: -tombstone.store[RESOURCE_ENERGY],
                    ticksUntilBeginFilling: tombstone.ticksToDecay,
                    id: tombstone.id,
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

        // Add the storage, only if we have somewhere to put the energy 
        // to avoid repetitively taking energy in and out of the storage
        const dropoffPoints = this.getEnergyDropoffPoints();

        // In this case, two points will always be active
        // Storage and upgrader container
        if (dropoffPoints.length > 2) {
            const storage = this.room.storage;
            if (storage) {
                pickupPoints.push({
                    pos: storage.pos,
                    amount: storage.store[RESOURCE_ENERGY],
                    fillrate: 0,
                    ticksUntilBeginFilling: 0,
                    id: storage.id,
                });
            }
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
        function addDropoffPoint(structure) {
            if (!structure.store.getFreeCapacity(RESOURCE_ENERGY)) {
                return;
            }
            dropoffPoints.push({
                pos: structure.pos,
                amount: structure.store.getFreeCapacity(RESOURCE_ENERGY),
                id: structure.id,
            });
        }

        // Add all extensions, spawns, and towers
        this.room.find(FIND_MY_STRUCTURES, { filter: (s) => {
            return s.structureType == STRUCTURE_EXTENSION || 
                   s.structureType == STRUCTURE_SPAWN || 
                   s.structureType == STRUCTURE_TOWER;
        }}).forEach((structure) => {
            addDropoffPoint(structure);
        });

        // Also add the upgrader's container, if one exists
        const upgraderContainer = this.getUpgraderContainer();
        if (upgraderContainer) {
            addDropoffPoint(upgraderContainer);
        }

        // Finally, add the storage, if one exists
        const storage = this.room.storage;
        if (storage) {
            addDropoffPoint(storage);
        }

        // Cache in case of multiple requests this tick
        this.cachedEnergyDropoffPoints = dropoffPoints;
        return dropoffPoints;
    }

    // #endregion
}

module.exports = RoomInfo;