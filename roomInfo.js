const remoteUtility = require("./remoteUtility");
const estimateTravelTime = require("./estimateTravelTime");
const haulerUtility = require("./haulerUtility");

class RoomInfo {

    /**
     * Initializes some data for this room that is guaranteed to be persistent between ticks.
     * @param {*} room 
     */
    constructor(room) {
        this.room = room;
        this.sources = this.room.find(FIND_SOURCES);
        this.mineral = this.room.find(FIND_MINERALS)[0];
    }

    /**
     * Initializes some data for this room that is not guaranteed to be persistent between ticks.
     */
    initializeTickInfo() {

        // Find all creeps that this room is responsible for, not just ones in it
        this.creeps = Object.values(Game.creeps).filter((c) => c.memory.home === this.room.name);

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

        // Used for planning remotes and hauler orders
        // (temporarily hardcoded)
        // TODO //
        // Dynamically calculate this
        // Start by using a flag or something
        // Then have the base planner eventually determine this
        this.core = new RoomPosition(33, 10, this.room.name);

        this.spawns = this.room.find(FIND_MY_SPAWNS);
        this.constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);

        this._pickupRequests = [];
        this._dropoffRequests = [];
        this.stolenOrders = [];
    }

    getMaxIncome() {
        return this.sources.reduce((total, source) => total + (source.energyCapacity / ENERGY_REGEN_TIME), 0);
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

        // Get all rooms of our active remotes
        const remoteRooms = new Set();
        for (const remote of base.remotes) {
            if (remote.active) {
                remoteRooms.add(remote.room);
            }
        }

        for (const roomName of remoteRooms) {
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
        for (const remote of remotePlans) {
            if (!remote.active) {
                continue;
            }
            if (Game.rooms[remote.room]) {
                structures.push(...Game.rooms[remote.room].find(FIND_STRUCTURES, { 
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
        for (const remote of remotes) {
            if (!remote.active) {
                continue;
            }

            // Start with containers
            const room = Game.rooms[remote.room];
            if (room) {
                const existingContainer = room.lookForAt(LOOK_STRUCTURES, remote.container.x, remote.container.y)
                    .find((s) => s.structureType === STRUCTURE_CONTAINER);
                if (!existingContainer) {
                    unbuilt.push({ pos: remote.container, type: STRUCTURE_CONTAINER });
                }
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
     * @returns An array of objects, each containing some data about the mining site:
     * - The position of the mining site (place to stand).
     * - The ID of the source to mine.
     */
    getMiningSites() {
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

        // Get the mining sites for remote rooms
        const remotePlans = remoteUtility.getRemotePlans(this.room.name);
        if (remotePlans) {
            for (const remote of remotePlans) {
                if (!remote.active) {
                    continue;
                }
                miningSpots.push({
                    pos: remote.container,
                    sourceID: remote.source.id,
                });
            }
        }

        // Cache in case of multiple requests this tick
        this.cachedMiningSpots = miningSpots;
        return miningSpots;
    }

    /**
     * Gets the first unreserved mining site, sorting by estimated distance.
     * @param {RoomPosition} pos The position to order the sites by distance to.
     * @returns An object containing some data about the mining site:
     * - The position of the mining site (place to stand).
     * - The ID of the source to mine.
     */
    getFirstUnreservedMiningSite(pos) {
        const sites = this.getMiningSites().sort((a, b) => {
            return estimateTravelTime(pos, a.pos) - estimateTravelTime(pos, b.pos);
        });

        // Find the first site where no miner has reserved
        return sites.find((site) => !this.miners.find((m) => m.memory.miningSite && m.memory.miningSite.sourceID === site.sourceID));
    }

    /**
     * An array of all mineral sites in this room.
     * @returns An object on mineral sites, each containing a container position and mineral ID.
     */
    getMineralSites() {
        const mineralSpots = [];
        const base = Memory.bases[this.room.name];
        for (const key in base.mineralContainers) {
            const mineral = Game.getObjectById(key);
            const extractor = mineral.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_EXTRACTOR);
            if (extractor) {
                mineralSpots.push({
                    pos: base.mineralContainers[key],
                    mineralID: key,
                    extractorID: extractor.id,
                });
            }
        }
        return mineralSpots;
    }

    // #endregion

    // #region Hauling

    /**
     * Creates a pickup request for haulers with the given parameters. Pickup requests under the same position will be grouped.
     * @param {number} amount The amount.
     * @param {ResourceConstant} resourceType The type of resource.
     * @param {number} fillrate The approximate rate at which the resource will accumulate at the pickup location.
     * Can be negative if resource will decay.
     * @param {boolean} isSource Is this request under a source? If yes, it will only be returned 
     * if the energy is greater than or equal to the requesting hauler's carry capacity.
     * @param {RoomPosition} pos The position of the resources to pickup.
     */
    createPickupRequest(amount, resourceType, fillrate, isSource, pos) {
        if (amount === 0) {
            return;
        }

        // If a pickup request already exists for this position, let's group it
        const existingRequest = this._pickupRequests.find((request) => {
            return request.pos.isEqualTo(pos) && request.resourceType === resourceType;
        });
        if (existingRequest) {
            existingRequest.amount += amount;
            existingRequest.fillrate += fillrate;
            return;
        }

        // Search for haulers currently assigned to this job
        const assignedHaulers = this.haulers.filter((h) => {
            return h.memory.pickup && 
                h.memory.pickup.pos.x === pos.x &&
                h.memory.pickup.pos.y === pos.y &&
                h.memory.pickup.pos.roomName === pos.roomName;
        }).map((h) => h.id);
        this._pickupRequests.push({
            requestID: this._pickupRequests.length,
            amount,
            resourceType,
            fillrate,
            isSource,
            pos,
            assignedHaulers,
        });
    }

    /**
     * Creates a dropoff request for haulers with the given parameters.
     * @param {ResourceConstant} resourceType The type of resource.
     * @param {number} amount The amount.
     * @param {string[]} dropoffIDs The game IDs of the structures/creeps requesting a dropoff. 
     * Pass multiple if multiple dropoff points are acceptable (primarily for link usage).
     */
    createDropoffRequest(amount, resourceType, dropoffIDs) {
        if (amount === 0) {
            return;
        }
        const assignedHaulers = this.haulers.filter((h) => h.memory.dropoff && dropoffIDs.includes(h.memory.dropoff.id)).map((h) => h.id);
        this._dropoffRequests.push({
            requestID: this._dropoffRequests.length,
            amount,
            resourceType,
            dropoffIDs,
            assignedHaulers,
        });
    }

    /**
     * Returns all pickup requests, source requests will be filtered so that only ones who's amounts are 
     * greater than or equal to the carry capacity of the requesting creep will be returned.
     * @param {Creep} creep The hauler requesting the pickup request.
     * @returns {{}[]} An array of pickup requests.
     */
    getPickupRequests(creep) {
        // Add a property that tells us if this pickup point has enough haulers assigned to fill its request or not
        this._pickupRequests.forEach((pickup) => {
            pickup.assignedHaulers = pickup.assignedHaulers.filter((hauler) => Game.getObjectById(hauler));
            const total = pickup.assignedHaulers.reduce((total, currID) => {
                return total + Game.getObjectById(currID).store.getFreeCapacity();
            }, 0);
            pickup.hasEnough = total >= pickup.amount;
        });

        return this._pickupRequests.filter((pickup) => {
            return !pickup.isSource || 
                // Using our core as our distance since we don't want further haulers accepting the orders
                // before earlier because the further ones see there as being more energy than the closer ones
                pickup.amount + (pickup.fillrate * estimateTravelTime(this.core, pickup.pos)) >= creep.store.getCapacity();
        });
    }

    /**
     * Returns all dropoff requests matching the appropriate resource type.
     * @param {ResourceConstant} resourceType The type of resource.
     * @returns {{}[]} An array of dropoff requests that match the resource type.
     */
    getDropoffRequests(resourceType) {
        // Filter for the correct request type
        const validDropoffs = this._dropoffRequests.filter((dropoff) => {
            return dropoff.resourceType === resourceType;
        });

        // Add a property that tells us if this dropoff point has enough haulers assigned to it to fill its request or not
        this._dropoffRequests.forEach((dropoff) => {
            // Filter to exclude haulers that no longer exist
            dropoff.assignedHaulers = dropoff.assignedHaulers.filter((hauler) => Game.getObjectById(hauler));
            const total = dropoff.assignedHaulers.reduce((total, currID) => {
                return total + Game.getObjectById(currID).store[dropoff.resourceType];
            }, 0);
            dropoff.hasEnough = total >= dropoff.amount;
        });

        // If we don't have any requests, let's add the storage
        if (!validDropoffs.length && this.room.storage) {
            // It won't matter how much, what type, or who's assigned
            // We will accept all haulers
            return [{
                amount: this.room.storage.store.getFreeCapacity(),
                resourceType: resourceType,
                dropoffIDs: [this.room.storage.id],
                assignedHaulers: [],
            }];
        }
        return validDropoffs;
    }

    /**
     * Adds a hauler to the matching pickup request.
     * @param {string} requestID The ID of the request.
     * @param {string} haulerID The ID of the hauler to add.
     */
    acceptPickupRequest(requestID, haulerID) {
        const request = this._pickupRequests.find((r) => r.requestID === requestID);
        if (request) {
            request.assignedHaulers.push(haulerID);
        }
    }

    /**
     * Adds a hauler to the matching dropoff request.
     * @param {string} requestID The ID of the dropoff request.
     * @param {string} haulerID The ID of the hauler to add.
     */
    acceptDropoffRequest(requestID, haulerID) {
        const request = this._dropoffRequests.find((r) => r.requestID === requestID);
        if (request) {
            request.assignedHaulers.push(haulerID);
        }
    }

    // #endregion
}

module.exports = RoomInfo;