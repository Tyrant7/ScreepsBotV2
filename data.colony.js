const remoteUtility = require("./remote.remoteUtility");
const estimateTravelTime = require("./util.estimateTravelTime");
const { getPlanData, keys } = require("./base.planningUtility");
const { roles, ROOM_SIZE } = require("./constants");
const { MINER_WORK, REMOTE_MINER_WORK } = require("./spawn.spawnConstants");
const profiler = require("./debug.profiler");
const { RESERVER_COST } = require("./spawn.creepMaker");
const { MINIMUM_PICKUP_AMOUNT } = require("./constants");
const { repairThresholds } = require("./constants");
const { onRemoteDrop } = require("./event.colonyEvents");

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

        this.remotesNeedingRepair = [];
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
        this.miningSites = getPlanData(
            this.room.name,
            keys.sourceContainerPositions
        ).map((container) => {
            return {
                pos: new RoomPosition(container.x, container.y, this.room.name),
                sourceID: container.sourceID,
                isReserved: true,
            };
        });

        this.enemies = this.room.find(FIND_HOSTILE_CREEPS);
        this.remoteEnemies = [];
        this.invaderCores = [];

        const isRoadDecayTick = Game.time % ROAD_DECAY_TIME === 0 && RELOAD;
        if (isRoadDecayTick) {
            this.remotesNeedingRepair = [];
        }

        this.remotePlans = remoteUtility.getRemotePlans(this.room.name);
        if (this.remotePlans) {
            // Get all rooms of our active remotes for construction site and enemy searching
            const remoteRooms = new Set();
            for (const remote of this.memory.remotes) {
                if (!remote.active) continue;
                remoteRooms.add(remote.room);

                // Mining sites
                this.miningSites.push({
                    pos: new RoomPosition(
                        remote.container.x,
                        remote.container.y,
                        remote.container.roomName
                    ),
                    sourceID: remote.source.id,
                    isReserved:
                        this.room.energyCapacityAvailable >= RESERVER_COST,
                });

                // Every so often, let's scan the roads of each remote to make
                // sure that none of them have decayed too low
                if (isRoadDecayTick) {
                    for (const road of remote.roads) {
                        const room = Game.rooms[road.roomName];
                        if (!room) continue;
                        const roadStructure = room
                            .lookForAt(LOOK_STRUCTURES, road.x, road.y)
                            .find((s) => s.structureType === STRUCTURE_ROAD);
                        if (
                            roadStructure.hits / roadStructure.hitsMax <
                            repairThresholds[STRUCTURE_ROAD]
                        ) {
                            remotesNeedingRepair.push({
                                endPos: remote.container,
                                sourceID: remote.source.id,
                                hits:
                                    roadStructure.hits / roadStructure.hitsMax,
                            });
                            break;
                        }
                    }
                }
            }
            for (const roomName of remoteRooms) {
                const room = Game.rooms[roomName];
                if (!room) continue;

                // Enemies
                this.remoteEnemies = this.remoteEnemies.concat(
                    room.find(FIND_HOSTILE_CREEPS)
                );

                // Construction sites
                this.constructionSites = this.constructionSites.concat(
                    room.find(FIND_CONSTRUCTION_SITES)
                );

                const invaderCoreInThisRoom = room
                    .find(FIND_HOSTILE_STRUCTURES)
                    .find((s) => s.structureType === STRUCTURE_INVADER_CORE);
                if (invaderCoreInThisRoom) {
                    this.invaderCores = this.invaderCores.concat(
                        invaderCoreInThisRoom
                    );
                }
            }
        }
        profiler.endSample("finds");
        profiler.startSample("other init");

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
        this.wantedStructures = null;
        this._pickupRequests = {};
        this._dropoffRequests = {};

        profiler.endSample("other init");
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

    // #region Mining

    /**
     * Gets the first unreserved mining site, sorting by estimated distance.
     * @param {RoomPosition?} pos The position to order the sites by distance to.
     * @returns An object containing some data about the mining site:
     * - The position of the mining site (place to stand).
     * - The ID of the source to mine.
     */
    getFirstOpenMiningSite(pos = null) {
        let validSites = this.miningSites;
        if (pos) {
            validSites.sort(
                (a, b) =>
                    estimateTravelTime(pos, a.pos) -
                    estimateTravelTime(pos, b.pos)
            );
        }
        return validSites.find((site) => {
            const source = Game.getObjectById(site.sourceID);

            // No view of source -> no miner there yet, so
            // this must be a valid site since all sites can hold at least one miner
            if (!source) return true;

            // We're going to look for sites where the number of allocated miners is
            // less than the amount of open spaces
            const allocatedMiners = this.miners.filter(
                (m) =>
                    m.memory.miningSite &&
                    m.memory.miningSite.sourceID === site.sourceID
            );

            // First condition:
            // The total number of WORK parts is less than that needed to fully mine a source
            const totalWork = allocatedMiners.reduce(
                (total, curr) =>
                    total + curr.body.filter((p) => p.type === WORK).length,
                0
            );
            const neededWork = site.isReserved ? MINER_WORK : REMOTE_MINER_WORK;
            if (totalWork >= neededWork) return false;

            // Second condition:
            // Fewer miners assigned than the number of open spaces next to this source
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
            return allocatedMiners.length < openSpaces;
        });
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

    hashDropoffRequest(dropoffIDs, resourceType) {
        return `${dropoffIDs.toString()}+${resourceType}`;
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

        // We'll assign haulers once orders are finalized
        this._pickupRequests[hash] = {
            requestID: hash,
            tick: Game.time,
            amount,
            resourceType,
            fillrate,
            isSource,
            pos,
            assignedHaulers: [],
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
        const hash = this.hashDropoffRequest(dropoffIDs, resourceType);

        // We'll assign haulers once orders are finalized
        this._dropoffRequests[hash] = {
            requestID: hash,
            tick: Game.time,
            amount,
            resourceType,
            dropoffIDs,
            assignedHaulers: [],
        };
    }

    /**
     * Filters out any outdated requests from previous ticks. Should be called after
     * all requests for this tick have been created to avoid loss of information when
     * carrying over request data from the previous tick.
     */
    finalizeRequests() {
        // Let's figure out which haulers are assigned to which requests
        const pickups = {};
        const dropoffs = {};
        for (const hauler of this.haulers) {
            if (hauler.memory.pickup) {
                pickups[hauler.memory.pickup.hash] = (
                    pickups[hauler.memory.pickup.hash] || []
                ).concat(hauler.id);
                continue;
            }
            if (hauler.memory.dropoff) {
                dropoffs[hauler.memory.dropoff.hash] = (
                    dropoffs[hauler.memory.dropoff.hash] || []
                ).concat(hauler.id);
            }
        }

        // Let's filter out any outdated requests here
        for (const hash in this._pickupRequests) {
            if (this._pickupRequests[hash].tick !== Game.time) {
                delete this._pickupRequests[hash];
                continue;
            }

            // And assign haulers here
            this._pickupRequests[hash].assignedHaulers = pickups[hash] || [];
        }
        for (const hash in this._dropoffRequests) {
            if (this._dropoffRequests[hash].tick !== Game.time) {
                delete this._dropoffRequests[hash];
                continue;
            }

            // And assign haulers here
            this._dropoffRequests[hash].assignedHaulers = dropoffs[hash] || [];
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
            // Let's also figure out if this pickup point has enough haulers assigned to fill its request or not
            const total = pickup.assignedHaulers.reduce((total, currID) => {
                return (
                    total + Game.getObjectById(currID).store.getFreeCapacity()
                );
            }, 0);
            pickup.hasEnough = total >= pickup.amount;
        });

        return requests.filter((pickup) => {
            if (pickup.amount < MINIMUM_PICKUP_AMOUNT) {
                return false;
            }
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
        if (
            !validDropoffs.length &&
            this.room.storage &&
            this.room.storage.store.getFreeCapacity()
        ) {
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
    }

    // #endregion
}

module.exports = Colony;
