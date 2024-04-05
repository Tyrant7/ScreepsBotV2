const remoteUtility = require("./remoteUtility");
const estimateTravelTime = require("./estimateTravelTime");

class RoomInfo {

    /**
     * Initializes some data for this room that is guaranteed to be persistent between ticks.
     * @param {*} room 
     */
    constructor(room) {
        this.room = room;
        this.sources = this.room.find(FIND_SOURCES);
        this.mineral = this.room.find(FIND_MINERALS)[0];

        // These will be objects mapping game IDs to request objects
        this._pickupRequests = {};
        this._dropoffRequests = {};
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

        this.spawns = this.room.find(FIND_MY_SPAWNS);
        this.constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
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
     * Creates a pickup request for haulers with the given parameters.
     * @param {ResourceConstant} resourceType The type of resource.
     * @param {number} amount The amount.
     * @param {number} fillrate The approximate rate at which the resource will accumulate at the pickup location.
     * Can be negative if resource will decay.
     * @param {number} ticksUntilBeginFilling The approximate number of ticks until the filling will start. 
     * Use if request will expire or if there will be a delay before filling.
     * @param {string} ownerID The game ID of the object requesting a pickup.
     */
    createPickupRequest(resourceType, amount, fillrate, ticksUntilBeginFilling, ownerID) {
        this._pickupRequests[ownerID] = {
            resourceType,
            amount,
            fillrate,
            ticksUntilBeginFilling,
            ownerID,
            assignedHauler: null,
        };
    }

    /**
     * Creates a dropoff request for haulers with the given parameters.
     * @param {ResourceConstant} resourceType The type of resource.
     * @param {number} amount The amount.
     * @param {string} ownerID The game ID of the structure/creep requesting a dropoff.
     */
    createDropoffRequest(resourceType, amount, ownerID) {
        this._dropoffRequests[ownerID] = {
            resourceType,
            amount,
            ownerID,
            assignedHauler: null,
        };
    }

    /**
     * Gets an existing pickup request for the given owner, if one exists.
     * @param {string} ownerID The game ID of the owner of the request.
     * @returns The matching pickup request. Undefined if none exists.
     */
    getExistingPickupRequest(ownerID) {
        return this._pickupRequests[ownerID];
    }

    /**
     * Gets an existing dropoff request for the given owner, if one exists.
     * @param {string} ownerID The game ID of the owner of the request.
     * @returns The matching dropoff request. Undefined if none exists.
     */
    getExistingDropoffRequest(ownerID) {
        return this._dropoffRequests[ownerID];
    }

    /**
     * Runs a cleanup to ensure valid pickup requests, then returns an array of remaining pickup requests.
     * @returns {{}[]} An array of pickup requests.
     */
    getPickupRequests() {
        // Cleanup our requests by removing invalid ones and unmarking ones where the hauler has died
        for (const owner in this._pickupRequests) {
            if (Game.getObjectById(owner)) {
                if (!Game.getObjectById(this._pickupRequests[owner].assignedHauler)) {
                    this._pickupRequests[owner].assignedHauler = null;
                }
                continue;
            }
            delete this._pickupRequests[owner];
        }
        return Object.values(this._pickupRequests);
    }

    /**
     * Runs a cleanup to ensure valid dropoff requests, then returns an array of remaining dropoff requests
     * matching the resource type.
     * @param {ResourceConstant} resourceType The type of resource.
     * @returns {{}[]} An array of dropoff requests matching the resource type.
     */
    getDropoffRequests(resourceType) {
        for (const owner in this._dropoffRequests) {
            if (Game.getObjectById(owner)) {
                if (!Game.getObjectById(this._pickupRequests[owner].assignedHauler)) {
                    this._pickupRequests[owner].assignedHauler = null;
                }
                continue;
            }
            delete this._dropoffRequests[owner];
        }
        // Filter for the correct request type
        return Object.values(this._dropoffRequests).filter((request) => {
            return request.resourceType === resourceType ||
                request.resourceType === RESOURCES_ALL;
        });
    }

    /**
     * Marks a pickup request as active.
     * @param {string} ownerID The ID of the object responsible for the request.
     * @param {string} haulerID The ID of the hauler who accepted the request. 
     */
    acceptPickupRequest(ownerID, haulerID) {
        this._pickupRequests[ownerID].assignedHauler = haulerID;
    }

    /**
     * Marks a dropoff request as active.
     * @param {string} ownerID The ID of the object responsible for the request.
     * @param {string} haulerID The ID of the hauler who accepted the request. 
     */
    acceptDropoffRequest(ownerID, haulerID) {
        this._dropoffRequests[ownerID].assignedHauler = haulerID;
    }

    // #endregion
}

module.exports = RoomInfo;