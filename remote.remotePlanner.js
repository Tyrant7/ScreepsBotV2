const { MAX_VALUE } = require("./base.planningConstants");
const { getScoutingData } = require("./scouting.scoutingUtility");
const { makeMiner, makeHauler, makeReserver } = require("./spawn.creepMaker");
const { getCost, getSpawnTime } = require("./spawn.spawnUtility");

const PLANNING_PLAINS = 5;
const PLANNING_SWAMP = 8;
const PLANNING_ROAD = 3;
const PLANNING_RESERVER_SPOT = 13;

class RemotePlanner {
    /**
     * Plans remotes for a room. Returns early if not enough rooms have been scouted.
     * @param {Colony} colony The associated colony object.
     */
    planRemotes(colony) {
        /*
            Let's record each source as its own remote
            Each remote (source) should record a few things:
            {
                room:        string,
                source: {
                    id:      string,
                    pos:     RoomPosition,
                },
                roads:       RoomPosition[],
                container:   RoomPosition,
                
                neededCarry: number,

                score:       number,
                cost:        number,

                dependants:  string[],
            }
        */

        // First, let's get all of our possible remote rooms
        const potentialRemoteRooms = this.getPotentialRemoteRooms(
            colony.room.name
        );

        // Next, let's make a remote object for each source in these rooms
        const remotes = [];
        for (const remoteRoom of potentialRemoteRooms) {
            for (const source of getScoutingData(remoteRoom).sources) {
                remotes.push({
                    room: remoteRoom,
                    source: {
                        id: source.id,
                        pos: new RoomPosition(
                            source.pos.x,
                            source.pos.y,
                            remoteRoom
                        ),
                    },
                    dependants: [],
                });
            }
        }

        // Let's plan each route back to our base's core
        // As we do this, let's build up a few CostMatrix's of planned roads
        // to encourage remotes to combine roads where they can
        // The very first road position can be used as the container position
        const remoteMatrices = this.initializeRemoteMatrices(
            colony,
            potentialRemoteRooms
        );
        for (const remote of remotes) {
            const startPoint = colony.core;
            const roads = this.planRoads(
                remote.source.pos,
                startPoint,
                remoteMatrices
            );
            const container = roads.shift();

            remote.roads = roads;
            remote.container = container;

            // We can also easily figure out how much CARRY we'll need to support the income of each source
            // Since we plan roads all the way until the core, our travel distance is simply our number of roads
            // Each source gives 10 energy per tick, and hauler is empty on the way back
            // Therefore, 20 * distance / CARRY_CAPACITY
            remote.neededCarry = Math.ceil(
                (20 * roads.length) / CARRY_CAPACITY
            );

            // Update our cost matrices so the next remote is aware of our placed roads
            for (const road of roads) {
                remoteMatrices[road.roomName].set(
                    road.x,
                    road.y,
                    PLANNING_ROAD
                );
            }
            remoteMatrices[container.roomName].set(
                container.x,
                container.y,
                255
            );
        }

        // Next, we can figure out who's actually responsible for doubled up road plans

        // Here's how we'll do that:
        // 1. Add all planned roads to a set, tagging the road with an array of remotes that it belongs to
        // Once we've added all roads, while there are roads left in the set we can:
        // 2. Find the remote in the set with the fewest number of owned roads (i.e. the closest)
        // 3. For all roads planned by this remote that are also planned by another remote,
        //    remove them from the other remote's planned roads
        // 4. Add the closer remote as a dependant of the further remote
        // 5. Remove all roads of this remote from the set

        // 1. Add all planned roads to a set, tagging the road with an array of remotes that it belongs to
        let allRoads = [];
        for (const remote of remotes) {
            for (const roadPosition of remote.roads) {
                const existingPlan = allRoads.find((r) =>
                    r.pos.isEqualTo(roadPosition)
                );
                if (!existingPlan) {
                    allRoads.push({
                        pos: roadPosition,
                        owners: [remote.source.id],
                    });
                    continue;
                }
                existingPlan.owners.push(remote.source.id);
            }
        }

        // Once we've added all roads, while there are roads left in the set we can:
        while (allRoads.length) {
            // 2. Find the remote in the set with the fewest number of owned roads (i.e. the closest)
            const roadCountsForOwners = {};
            for (const plannedRoad of allRoads) {
                for (const owner of plannedRoad.owners) {
                    if (!roadCountsForOwners[owner]) {
                        roadCountsForOwners[owner] = 0;
                    }
                    roadCountsForOwners[owner]++;
                }
            }
            const fewestRoadsOwner = Object.keys(roadCountsForOwners).reduce(
                (lowest, curr) => {
                    return roadCountsForOwners[curr] <
                        roadCountsForOwners[lowest]
                        ? curr
                        : lowest;
                }
            );

            // Now we have the sourceID of the remote with the fewest roads in the set
            const nextRemote = remotes.find(
                (r) => r.source.id === fewestRoadsOwner
            );

            // 3. For all roads planned by this remote that are also planned by another remote
            for (const roadPosition of nextRemote.roads) {
                // Remove them from the other remote's planned roads
                const conflictingOwners = allRoads.find((road) =>
                    road.pos.isEqualTo(roadPosition)
                ).owners;
                for (const owner of conflictingOwners) {
                    // Don't filter our own roads
                    if (owner === nextRemote.source.id) {
                        continue;
                    }
                    const roadOwner = remotes.find(
                        (r) => r.source.id === owner
                    );
                    roadOwner.roads = roadOwner.roads.filter(
                        (rPos) => !rPos.isEqualTo(roadPosition)
                    );

                    // 4. Add the closer remote as a dependant of the further remote
                    if (!roadOwner.dependants.includes(nextRemote.source.id)) {
                        roadOwner.dependants.push(nextRemote.source.id);
                    }
                }

                // 5. Remove all roads of this remote from the set
                allRoads = allRoads.filter(
                    (r) => !r.pos.isEqualTo(roadPosition)
                );
            }
        }

        // Let's determine our score and cost for this source
        for (const remote of remotes) {
            // Each source's cost will be the spawn cost to spawn one miner, plus as many haulers as is needed in CARRY parts
            const upkeep = this.estimateCreepUpkeep(
                colony.room.energyCapacityAvailable,
                remote.neededCarry
            );
            remote.cost = upkeep.spawnTime;

            // Each source's score will be determined with a simple equation of:
            // sourceEnergy - (spawnEnergy + containerMaintenance + roadMaintenance)
            // Keep in mind that through the above algorithm, shared roads will be owned by the closer remote and will not
            // count against the maintenance cost of the further remote(s)
            const sourceEnergy = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
            const spawnEnergy = upkeep.energy;
            const containerMaintenance =
                CONTAINER_DECAY / CONTAINER_DECAY_TIME / REPAIR_POWER;

            // Remember that roads built on swamps cost 5x more
            let roadMaintenance = 0;
            const roadUpkeep =
                ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME / REPAIR_POWER;
            remote.roads.forEach((road) => {
                const terrain = Game.map
                    .getRoomTerrain(road.roomName)
                    .get(road.x, road.y);
                roadMaintenance +=
                    roadUpkeep *
                    (terrain === TERRAIN_MASK_SWAMP
                        ? CONSTRUCTION_COST_ROAD_SWAMP_RATIO
                        : 1);
            });
            remote.score =
                sourceEnergy -
                (spawnEnergy + containerMaintenance + roadMaintenance);
        }

        // Filter out remotes that are impossible to profit from
        const finalRemotes = remotes.filter((remote) => remote.score > 0);

        // As a final note:
        // When deciding which remotes to mine, we should always take the remote with the best score/cost ratio
        // However, we cannot take remotes that do not have their dependancies met
        //
        // For example, if we have one remote that is 15 tiles away, and another that is 17 tiles, we will take the 15 tile one first
        // Let's suppose that the 15 tile remote also has a dependant that is 20 tiles away
        // We'll naturally go with the 20 tiles remote, because its cost only considers those 5 tiles of additional road, however
        // we could not have chosen that technically cheaper (remember that it only costs 5 tiles of road, instead of 15)
        // remote first, since the 15 tile remote it depended on was not activated yet
        return finalRemotes;
    }

    /**
     * Gets all possible remote rooms in Manhattan distance of 2.
     * @param {string} baseName Name of the room to get remotes for.
     * @returns {string[]} An array of room names.
     */
    getPotentialRemoteRooms(baseName) {
        // Let's make a set containing all rooms in Manhattan distance of 2
        const nearbyRooms = [];
        for (const neighbour of Object.values(
            Game.map.describeExits(baseName)
        )) {
            if (this.isValidRemote(neighbour)) {
                nearbyRooms.push(neighbour);
            }
            for (const neighbourOfNeighbours of Object.values(
                Game.map.describeExits(neighbour)
            )) {
                if (
                    neighbourOfNeighbours !== baseName &&
                    !nearbyRooms.includes(neighbourOfNeighbours) &&
                    this.isValidRemote(neighbourOfNeighbours)
                ) {
                    nearbyRooms.push(neighbourOfNeighbours);
                }
            }
        }
        return nearbyRooms;
    }

    /**
     * Determines if this room is a valid remote.
     * @param {string} roomName The name of the room to check.
     * @returns True or false depending on the presence of sources, invaders, players, and other factors.
     */
    isValidRemote(roomName) {
        const remoteInfo = getScoutingData(roomName);
        if (!remoteInfo || !remoteInfo.lastVisit) {
            return false;
        }

        // No sources
        if (!remoteInfo.sources || !remoteInfo.sources.length) {
            return false;
        }

        // Source keepers
        if (
            (remoteInfo.sourceKeepers && remoteInfo.sourceKeepers.length) ||
            (remoteInfo.keeperLairs && remoteInfo.keeperLairs.length)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Initializes empty cost matrices for each remote room, and fills in some structures details for the main room.
     * @param {Colony} colony Info for the main room.
     * @param {string[]} remoteRooms Names of all of the rooms to create a CostMatrix for.
     * @returns {PathFinder.CostMatrix[]} An array of cost matrices.
     */
    initializeRemoteMatrices(colony, remoteRooms) {
        const matrices = {};

        // To start, we can initialize the matrix for our main room with our existing structures
        matrices[colony.room.name] = new PathFinder.CostMatrix();
        colony.allStructures.forEach((s) => {
            const value =
                s.structureType === STRUCTURE_ROAD
                    ? PLANNING_ROAD
                    : s.structureType !== STRUCTURE_RAMPART
                    ? MAX_VALUE
                    : 0;
            matrices[colony.room.name].set(s.pos.x, s.pos.y, value);
        });

        for (const remoteRoom of remoteRooms) {
            matrices[remoteRoom] = new PathFinder.CostMatrix();

            // We'll discourage pathing directly next to the controller
            // since reservers will be working there
            const room = getScoutingData(remoteRoom);
            if (!room.controller) continue;
            const contP = room.controller.pos;
            const terrain = Game.map.getRoomTerrain(remoteRoom);
            for (let x = contP.x - 1; x <= contP.x + 1; x++) {
                for (let y = contP.y - 1; y <= contP.y + 1; y++) {
                    if (x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                        continue;
                    }
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                        continue;
                    }
                    matrices[remoteRoom].set(x, y, PLANNING_RESERVER_SPOT);
                }
            }
        }
        return matrices;
    }

    /**
     * Plans roads from 'from' to 'to', using a precreated array of CostMatrix's.
     * @param {RoomPosition} from The position to path from
     * @param {RoomPosition} to The position to path to.
     * @param {PathFinder.CostMatrix[]} costMatrices The array of cost matrices to use.
     * Should contain data about roads planned by other remotes, as well as data about the structures in the room that owns this remote.
     * @returns {RoomPosition[]} An array of road positions.
     */
    planRoads(from, to, costMatrices) {
        return PathFinder.search(
            from,
            { pos: to, range: 1 },
            {
                plainCost: PLANNING_PLAINS,
                swampCost: PLANNING_SWAMP,

                // If we're not planning for that room, we shouldn't move through it
                // Let's return false so we don't waste operations trying to path to a room
                // that's further away from our target's room
                roomCallback: function (roomName) {
                    if (costMatrices[roomName]) {
                        return costMatrices[roomName];
                    }
                    return false;
                },
            }
        ).path;
    }

    /**
     * Estimates amount of energy and spawnTime to keep spawn enough creeps to keep a remote operational.
     * @param {number} maxEnergy The energy capacity of the room where creeps will be spawned.
     * @param {number} neededCarry The amount of carry parts needed by this remote.
     * @returns {{energy: number, spawnTime: number}} An object with energy and spawnTime for creeps already adjusted for creep lifetime.
     */
    estimateCreepUpkeep(maxEnergy, neededCarry) {
        const upkeep = { energy: 0, spawnTime: 0 };

        // Start with a miner
        const miner = makeMiner(maxEnergy);
        upkeep.energy += getCost(miner.body) / CREEP_LIFE_TIME;
        upkeep.spawnTime += getSpawnTime(miner.body) / CREEP_LIFE_TIME;

        // Then haulers until we hit our needed carry
        let totalCarry = 0;
        while (totalCarry < neededCarry) {
            const newHauler = makeHauler(maxEnergy);
            totalCarry += newHauler.body.filter((p) => p === CARRY).length;
            upkeep.energy += getCost(newHauler.body) / CREEP_LIFE_TIME;
            upkeep.spawnTime += getSpawnTime(newHauler.body) / CREEP_LIFE_TIME;
        }

        // Then reservers
        // Rooms have about 1.5 sources on average (just a guess to make our estimates more accurate)
        const AVG_SOURCES_PER_ROOM = 1.5;
        const reserver = makeReserver();
        upkeep.energy +=
            getCost(reserver.body) /
            CREEP_CLAIM_LIFE_TIME /
            AVG_SOURCES_PER_ROOM;
        upkeep.spawnTime +=
            getSpawnTime(reserver.body) /
            CREEP_CLAIM_LIFE_TIME /
            AVG_SOURCES_PER_ROOM;

        return upkeep;
    }
}

module.exports = RemotePlanner;
