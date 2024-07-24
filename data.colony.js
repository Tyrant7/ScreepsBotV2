const remoteUtility = require("./remote.remoteUtility");
const estimateTravelTime = require("./util.estimateTravelTime");
const { getPlanData, keys } = require("./base.planningUtility");
const { roles, ROOM_SIZE } = require("./constants");
const { MINER_WORK, REMOTE_MINER_WORK } = require("./spawn.spawnConstants");
const profiler = require("./debug.profiler");
const { RESERVER_COST } = require("./spawn.creepMaker");

class Colony {
    /**
     * Initializes some data for this room that is guaranteed to be persistent between ticks.
     * @param {*} room
     */
    constructor(room) {
        this.room = room;
        if (!Memory.colonies[this.room.name]) {
            Memory.colonies[this.room.name] = {};
        }
        this.sources = this.room.find(FIND_SOURCES);
        this.mineral = this.room.find(FIND_MINERALS)[0];

        this._pickupRequests = {};
        this._dropoffRequests = {};
    }

    /**
     * Initializes some data for this room that is not guaranteed to be persistent between ticks.
     */
    initializeTickInfo() {
        // Reinitialize stale objects
        profiler.startSample("cache");
        this.room = Game.rooms[this.room.name];
        this.memory = Memory.colonies[this.room.name];
        this.sources = this.sources.map((s) => Game.getObjectById(s.id));
        this.mineral = Game.getObjectById(this.mineral.id);
        profiler.endSample("cache");

        // If any of our supporting colonies have emerged as full colonies, let's remove them
        if (!this.memory.supporting) {
            this.memory.supporting = [];
        }
        for (const supporting of this.memory.supporting) {
            if (!Memory.newColonies[supporting]) {
                this.memory.supporting = this.memory.supporting.filter(
                    (s) => s !== supporting
                );
            }
        }

        // Find all creeps that this room is responsible for, not just ones in it
        profiler.startSample("group creeps");
        this.creeps = Object.values(Game.creeps).filter(
            (c) => c.memory.home === this.room.name
        );

        // Dynamically intialize an array for each role
        for (const role in roles) {
            const propName = role + "s";
            this[propName] = [];
        }

        // Map each role's string name found on creeps to it's code name
        const roleToArrayMap = {};
        Object.keys(roles).forEach((roleName) => {
            roleToArrayMap[roles[roleName]] = this[roleName + "s"];
        });

        // Push each creep to their matching array
        this.creeps.forEach((creep) => {
            const array = roleToArrayMap[creep.memory.role];
            if (array) {
                array.push(creep);
            }
        });
        profiler.endSample("group creeps");

        profiler.startSample("finds");
        this.allStructures = this.room.find(FIND_STRUCTURES);
        this.structures = _.groupBy(this.allStructures, "structureType");

        this.constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
        this.remotePlans = remoteUtility.getRemotePlans(this.room.name);
        if (this.remotePlans) {
            for (const plan of this.remotePlans) {
                if (!Game.rooms[plan.room]) continue;
                this.constructionSites = this.constructionSites.concat(
                    Game.rooms[plan.room].find(FIND_CONSTRUCTION_SITES)
                );
            }
        }

        // Used for distance calculations of hauler orders
        this.core = this.memory.core
            ? this.room.getPositionAt(this.memory.core.x, this.memory.core.y)
            : this.room.getPositionAt(25, 25);

        // If this colony has a spawn, let's make sure that it isn't a new colony anymore
        // No need for surrogate spawns anymore
        if (
            Memory.newColonies[this.room.name] &&
            this.structures[STRUCTURE_SPAWN]
        ) {
            delete Memory.newColonies[this.room.name];
        }

        // Clear tick caches
        this.cachedMiningSpots = null;
        profiler.endSample("finds");
    }

    getMaxIncome() {
        return this.sources.reduce(
            (total, source) =>
                total + source.energyCapacity / ENERGY_REGEN_TIME,
            0
        );
    }

    /**
     * Finds enemies in this room's remotes.
     * @returns {Creep[]} An array of enemy creeps in this room's remotes.
     */
    getRemoteEnemies() {
        const enemies = [];

        // Get all rooms of our active remotes
        // and search them for enemies too
        if (this.memory.remotes) {
            const remoteRooms = new Set();
            for (const remote of this.memory.remotes) {
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
                enemies.push(...enemies);
            }
        }
        return enemies;
    }

    getUpgraderContainer() {
        const containerPos = getPlanData(
            this.room.name,
            keys.upgraderContainerPos
        );
        if (!containerPos) {
            return null;
        }
        return this.room
            .lookForAt(LOOK_STRUCTURES, containerPos.x, containerPos.y)
            .find((s) => s.structureType === STRUCTURE_CONTAINER);
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

        const structures = [...this.allStructures];
        for (const remote of this.remotePlans) {
            if (!remote.active) {
                continue;
            }
            if (Game.rooms[remote.room]) {
                structures.push(
                    ...Game.rooms[remote.room].find(FIND_STRUCTURES, {
                        filter: (s) =>
                            remoteUtility.isStructurePlanned(
                                this.room.name,
                                s.pos,
                                s.structureType
                            ),
                    })
                );
            }
        }

        this.wantedStructures = structures;
        return structures;
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
        const sourceContainers = getPlanData(
            this.room.name,
            keys.sourceContainerPositions
        );
        for (const container of sourceContainers) {
            miningSpots.push({
                pos: new RoomPosition(container.x, container.y, this.room.name),
                sourceID: container.sourceID,
                isReserved: true,
            });
        }

        // Get the mining sites for remote rooms
        if (this.remotePlans) {
            for (const remote of this.remotePlans) {
                if (!remote.active) {
                    continue;
                }
                miningSpots.push({
                    pos: new RoomPosition(
                        remote.container.x,
                        remote.container.y,
                        remote.container.roomName
                    ),
                    sourceID: remote.source.id,
                    isReserved:
                        this.room.energyCapacityAvailable >= RESERVER_COST,
                });
            }
        }

        // Cache in case of multiple requests this tick
        this.cachedMiningSpots = miningSpots;
        return miningSpots;
    }

    /**
     * Gets the first unreserved mining site, sorting by estimated distance.
     * @param {RoomPosition?} pos The position to order the sites by distance to.
     * @returns An object containing some data about the mining site:
     * - The position of the mining site (place to stand).
     * - The ID of the source to mine.
     */
    getFirstOpenMiningSite(pos = null) {
        const validSites = this.getMiningSites()
            .sort((a, b) => {
                return pos
                    ? estimateTravelTime(pos, a.pos) -
                          estimateTravelTime(pos, b.pos)
                    : 0;
            })
            .filter((site) => {
                // We're going to look for sites where the number of allocated miners is
                // less than the amount of open spaces
                const allocatedMiners = this.miners.filter(
                    (m) =>
                        m.memory.miningSite &&
                        m.memory.miningSite.sourceID === site.sourceID
                );
                const source = Game.getObjectById(site.sourceID);
                if (!source) {
                    // No view of source -> no miner there yet, so
                    // this must be a valid site since all sites can hold at least one miner
                    return true;
                }
                const sourcePos = source.pos;
                const roomTerrain = Game.map.getRoomTerrain(site.pos.roomName);
                let openSpaces = 0;
                for (let x = sourcePos.x - 1; x <= sourcePos.x + 1; x++) {
                    for (let y = sourcePos.y - 1; y <= sourcePos.y + 1; y++) {
                        if (x < 1 || x > 48 || y < 1 || y > 48) {
                            continue;
                        }
                        if (roomTerrain.get(x, y) === TERRAIN_MASK_WALL) {
                            continue;
                        }
                        openSpaces++;
                    }
                }
                if (allocatedMiners.length >= openSpaces) {
                    return false;
                }

                // And where the total number of WORK parts is less than that needed to fully mine a source
                const totalWork = allocatedMiners.reduce((total, curr) => {
                    return (
                        total + curr.body.filter((p) => p.type === WORK).length
                    );
                }, 0);

                const neededWork = site.isReserved
                    ? MINER_WORK
                    : REMOTE_MINER_WORK;
                if (totalWork >= neededWork) {
                    return false;
                }
                return true;
            });
        return validSites[0];
    }

    /**
     * An array of all mineral sites in this room.
     * @returns An object on mineral sites, each containing a container position and mineral ID.
     */
    getMineralSites() {
        const mineralSpots = [];
        const mineralContainer = getPlanData(
            this.room.name,
            keys.mineralContainerPos
        );
        const mineral = Game.getObjectById(mineralContainer.mineralID);
        const extractor = mineral.pos
            .lookFor(LOOK_STRUCTURES)
            .find((s) => s.structureType === STRUCTURE_EXTRACTOR);
        if (extractor) {
            mineralSpots.push({
                pos: new RoomPosition(
                    mineralContainer.x,
                    mineralContainer.y,
                    this.room.name
                ),
                mineralID: mineralContainer.mineralID,
                extractorID: extractor.id,
            });
        }
        return mineralSpots;
    }

    // #endregion

    // #region Hauling

    hashPickupRequest(pos, resourceType) {
        return `${pos.x + pos.y * ROOM_SIZE + pos.roomName},${resourceType}`;
    }

    hashDropoffRequest(dropoffIDs, amount, resourceType) {
        return `${dropoffIDs.toString()}+${amount}${resourceType}`;
    }

    /**
     * Creates a pickup request for haulers with the given parameters.
     * Pickup requests under the same position and resource type will be grouped.
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

        // If a pickup request already exists for this tick at this position, let's group it
        const hash = this.hashPickupRequest(pos, resourceType);
        const existingRequest = this._pickupRequests[hash];
        if (existingRequest && existingRequest.tick === Game.time) {
            existingRequest.amount += amount;
            existingRequest.fillrate += fillrate;
            return;
        }

        // Retain knowledge of assigned haulers between ticks
        const assignedHaulers = this._pickupRequests[hash]
            ? this._pickupRequests[hash].assignedHaulers
            : [];
        this._pickupRequests[hash] = {
            requestID: hash,
            tick: Game.time,
            amount,
            resourceType,
            fillrate,
            isSource,
            pos,
            assignedHaulers,
        };
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
        const hash = this.hashDropoffRequest(dropoffIDs, amount, resourceType);

        // Retain knowledge of assigned haulers between ticks
        const assignedHaulers = this._dropoffRequests[hash]
            ? this._dropoffRequests[hash].assignedHaulers
            : [];
        this._dropoffRequests[hash] = {
            requestID: hash,
            tick: Game.time,
            amount,
            resourceType,
            dropoffIDs,
            assignedHaulers,
        };
    }

    /**
     * Filters out any outdated requests from previous ticks. Should be called after
     * all requests for this tick have been created to avoid loss of information when
     * carrying over request data from the previous tick.
     */
    finalizeRequests() {
        // Let's filter out any outdated requests here
        for (const hash in this._pickupRequests) {
            if (this._pickupRequests[hash].tick !== Game.time) {
                delete this._pickupRequests[hash];
            }
        }
        for (const hash in this._dropoffRequests) {
            if (this._dropoffRequests[hash].tick !== Game.time) {
                delete this._dropoffRequests[hash];
            }
        }
    }

    /**
     * Returns all pickup requests, source requests will be filtered so that only ones who's amounts are
     * greater than or equal to the carry capacity of the requesting creep will be returned.
     * @param {Creep} creep The hauler requesting the pickup request.
     * @returns {{}[]} An array of pickup requests.
     */
    getPickupRequests(creep) {
        const requests = Object.values(this._pickupRequests);
        requests.forEach((pickup) => {
            // Filter out any assigned haulers that are no longer alive
            pickup.assignedHaulers = pickup.assignedHaulers.filter((h) =>
                Game.getObjectById(h)
            );

            // Let's also figure out if this pickup point has enough haulers assigned to fill its request or not
            const total = pickup.assignedHaulers.reduce((total, currID) => {
                return (
                    total + Game.getObjectById(currID).store.getFreeCapacity()
                );
            }, 0);
            pickup.hasEnough = total >= pickup.amount;
        });

        return requests.filter((pickup) => {
            return (
                !pickup.isSource ||
                // Using our core as our distance since we don't want further haulers accepting the orders
                // before earlier because the further ones see there as being more energy than the closer ones
                pickup.amount +
                    pickup.fillrate *
                        estimateTravelTime(this.core, pickup.pos) >=
                    creep.store.getCapacity()
            );
        });
    }

    /**
     * Returns all dropoff requests matching the appropriate resource type.
     * @param {ResourceConstant} resourceType The type of resource.
     * @returns {{}[]} An array of dropoff requests that match the resource type.
     */
    getDropoffRequests(resourceType) {
        // Filter for the correct request type
        const validDropoffs = Object.values(this._dropoffRequests).filter(
            (dropoff) => {
                return dropoff.resourceType === resourceType;
            }
        );

        // Add a few properties to each pickup request
        validDropoffs.forEach((dropoff) => {
            // Filter out any assigned haulers that are no longer alive
            dropoff.assignedHaulers = dropoff.assignedHaulers.filter((hauler) =>
                Game.getObjectById(hauler)
            );

            // Let's also figure out if this pickup point has enough haulers assigned to fill its request or not
            const total = dropoff.assignedHaulers.reduce((total, currID) => {
                return (
                    total +
                    Game.getObjectById(currID).store[dropoff.resourceType]
                );
            }, 0);
            dropoff.hasEnough = total >= dropoff.amount;
        });

        // If we don't have any requests, let's add the storage
        if (!validDropoffs.length && this.room.storage) {
            // It won't matter how much, what type, or who's assigned
            // We will accept all haulers
            return [
                {
                    amount: this.room.storage.store.getFreeCapacity(),
                    resourceType: resourceType,
                    dropoffIDs: [this.room.storage.id],
                    assignedHaulers: [],
                },
            ];
        }
        return validDropoffs;
    }

    /**
     * Adds a hauler to the matching pickup request.
     * @param {string} requestID The ID of the request.
     * @param {string} haulerID The ID of the hauler to add.
     */
    acceptPickupRequest(requestID, haulerID) {
        const request = this._pickupRequests[requestID];
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
        const request = this._dropoffRequests[requestID];
        if (request) {
            request.assignedHaulers.push(haulerID);
        }
    }

    /**
     * Removes a hauler from the matching pickup request, and clear its memory.
     * @param {string} requestID The ID of the pickup request.
     * @param {string} haulerID The ID of the hauler to remove.
     */
    unassignPickup(requestID, haulerID) {
        const request = this._pickupRequests[requestID];
        if (request) {
            request.assignedHaulers = request.assignedHaulers.filter(
                (id) => id !== haulerID
            );
        }
        delete Game.getObjectById(haulerID).memory.pickup;
    }

    /**
     * Removes a hauler from the matching dropoff request, and clear its memory.
     * @param {string} requestID The ID of the pickup request.
     * @param {string} haulerID The ID of the hauler to remove.
     */
    unassignDropoff(requestID, haulerID) {
        const request = this._dropoffRequests[requestID];
        if (request) {
            request.assignedHaulers = request.assignedHaulers.filter(
                (id) => id !== haulerID
            );
        }
        delete Game.getObjectById(haulerID).memory.dropoff;
    }

    // #endregion
}

module.exports = Colony;
