const PLANNING_PLAINS = 5;
const PLANNING_SWAMP = 6;
const PLANNING_ROAD = 1;

class RemotePlanner {

    /**
     * Plans remotes for a room. Returns early if not enough rooms have been scouted.
     * @param {RoomInfo} roomInfo The associated room info object.
     */
    planRemotes(roomInfo) {

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
            }
        */

        // First, let's get all of our possible remote rooms
        const potentialRemoteRooms = this.getPotentialRemoteRooms(roomInfo.room.name);

        // Next, let's make a remote object for each source in these rooms
        const remotes = [];
        for (const remoteRoom of potentialRemoteRooms) {
            for (const source of Memory.rooms[remoteRoom].sources) {
                remotes.push({
                    room: remoteRoom,
                    source: {
                        id: source.id,
                        pos: new RoomPosition(source.pos.x, source.pos.y, remoteRoom),
                    },
                });
            }
        }

        // Let's plan each route back to our storage
        // As we do this, let's build up a few CostMatrix's of planned roads 
        // to encourage remotes to combine roads where they can
        // The very first road position can be used as the container position
        const remoteMatrices = this.initializeRemoteMatrices(roomInfo, potentialRemoteRooms);
        for (const remote of remotes) {         
            const storage = roomInfo.room.storage;
            const roads = this.planRoads(remote.source.pos, storage.pos, remoteMatrices);
            const container = roads.shift();
            
            remote.roads = roads;
            remote.container = container;


            // We can also easily figure out how much CARRY we'll need to support the income of each source
            // Since we plan roads all the way until the storage, our travel distance is simply our number of roads
            // Each source gives 10 energy per tick, and hauler is empty on the way back
            // Therefore, 20 * distance / CARRY_CAPACITY
            remote.neededCarry = Math.ceil(20 * roads.length / CARRY_CAPACITY);

            // Update our cost matrices so the next remote is aware of our placed roads
            for (const road of roads) {
                remoteMatrices[road.roomName].set(road.x, road.y, PLANNING_ROAD);
            }
            remoteMatrices[container.roomName].set(container.x, container.y, 255);
        }


        // Next, we can figure out who's actually responsible for doubled up road plans

        // Here's how we'll do that:
        // 1. Add all planned roads to a set, tagging the road with an array of remotes that it belongs to
        // Once all roads have been added to the set, we'll:
        // 2. Find the remote in the set with the fewest number of owned roads (i.e. the closest)
        // 3. For all roads planned by this remote that are also planned by another remote,
        //    remove them from the other remote's planned roads
        // 4. Remove all roads of this remote from the set
        // 5. Repeat from step 2 until there are no roads remaining in the set
        
        // Utility method to allow us to use roads as keys
        function serializeRoad(road) {
            return road.x + "," + road.y + "," + road.roomName;
        }

        const balls = Game.cpu.getUsed();

        // 1. Add all planned roads to a set, tagging the road with an array of remotes that it belongs to 
        let allRoads = {};
        for (const remote of remotes) {
            for (const road of remote.roads) {
                const key = serializeRoad(road);
                if (!allRoads[key]) {
                    allRoads[key] = [];
                }
                allRoads[key].push(remote.source.id);
            }
        }

        // Once all roads have been added to the set, we'll:
        while (Object.keys(allRoads)) {

            // 2. Find the remote in the set with the fewest number of owned roads
            const owners = {};
            for (const road in allRoads) {
                const roadOwners = allRoads[road];
                for (const owner of roadOwners) {
                    if (!owners[owner]) {
                        owners[owner] = 0;
                    }
                    owners[owner]++;
                }
            }
            const fewestRoadsOwner = Object.keys(owners).reduce((lowest, curr) => {
                return owners[curr] < owners[lowest] ? curr : lowest;
            });

            // Now we have the sourceID of the remote with the fewest roads in the set
            const nextRemote = remotes.find((r) => r.source.id === fewestRoadsOwner);
            nextRemote.children = [];

            // 3. Set any owners of conflicting roads as children of this remote
            for (const road of nextRemote.roads) {
                const key = serializeRoad(road);
                const conflictingOwners = allRoads[key].filter((owner) => owner !== nextRemote.source.id);
                for (const owner of conflictingOwners) {
                    nextRemote.children.push(owner);

                    // 4. Remove any roads from the children of this remote that conflict with this remote's own roads
                    const roadOwner = remotes.find((r) => r.source.id === owner);
                    roadOwner.roads = roadOwner.roads.filter((r) => serializeRoad(r) !== key);
                }
            }

            // 5. Remove all roads of this remote from the set
            const newAllRoads = {};
            for (const key in allRoads) {
                if (!allRoads[key].includes(nextRemote.source.id)) {
                    newAllRoads[key] = allRoads[key];
                }
            }
            allRoads = newAllRoads;
        }

        console.log("Holy shit! We used: " + Game.cpu.getUsed() - balls + " cpu!");

        return;

        // Finally, let's determine our score and cost for this source
        // Each source's cost will be the spawn cost to spawn one miner, plus as many haulers as is needed in CARRY parts
        // Each source's score will be determined with a simple equation of:
        // sourceEnergy - spawnEnergy - maintenance (for roads and container)
        // Keep in mind that through the above algorithm, shared roads will be owned by the closer remote and will not
        // count against the maintenance cost of the further remote(s)

        // TODO //


        // (Optional)
        // Sort plans by the best income/cost ratio


        // We're finished!
        // Return all of our remote plans

    }

    /**
     * Gets all possible remote rooms in Manhattan distance of 2.
     * @param {string} baseName Name of the room to get remotes for.
     * @returns {string[]} An array of room names.
     */
    getPotentialRemoteRooms(baseName) {

        // Let's make a set containing all rooms in Manhattan distance of 2
        const nearbyRooms = [];
        for (const neighbour of Object.values(Game.map.describeExits(baseName))) {
            if (this.isValidRemote(neighbour)) {
                nearbyRooms.push(neighbour);
            }
            for (const neighbourOfNeighbours of Object.values(Game.map.describeExits(neighbour))) {
                if (neighbourOfNeighbours !== baseName && !nearbyRooms.includes(neighbourOfNeighbours) &&
                    this.isValidRemote(neighbourOfNeighbours)) {
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
        const remoteInfo = Memory.rooms[roomName];
        if (!remoteInfo.lastVisit) {
            return false;
        }

        // No sources
        if (!remoteInfo.sources || !remoteInfo.sources.length) {
            return false;
        }

        // Source keepers
        if ((remoteInfo.sourceKeepers && remoteInfo.sourceKeepers.length) || 
            (remoteInfo.keeperLairs && remoteInfo.keeperLairs.length)) {
            return false;
        }
        return true;
    }

    /**
     * Initializes empty cost matrices for each remote room, and fills in some structures details for the main room.
     * @param {RoomInfo} roomInfo Info for the main room.
     * @param {string[]} remoteRooms Names of all of the rooms to create a CostMatrix for.
     * @returns {PathFinder.CostMatrix[]} An array of cost matrices.
     */
    initializeRemoteMatrices(roomInfo, remoteRooms) {
        const matrices = {};

        // To start, we can initialize the matrix for our main room with our existing structures
        matrices[roomInfo.room.name] = new PathFinder.CostMatrix();
        roomInfo.room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_ROAD }}).forEach((s) => {
            if (s.structureType === STRUCTURE_ROAD) {
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, PLANNING_ROAD);
            }
            else if (s.structureType !== STRUCTURE_RAMPART || !s.my) {

                // Don't path over any structures except ramparts
                // Not including containers here either
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, 255);
            }
        });

        for (const remoteRoom of remoteRooms) {
            matrices[remoteRoom] = new PathFinder.CostMatrix();
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

        return PathFinder.search(from, { pos: to, range: 1 }, {
            plainCost: PLANNING_PLAINS,
            swampCost: PLANNING_SWAMP,

            // If we're not planning for that room, we shouldn't move through it
            // Let's return false so we don't waste operations trying to path to a room 
            // that's further away from our target's room
            roomCallback: function(roomName) {
                if (costMatrices[roomName]) {
                    return costMatrices[roomName];
                }
                return false;
            },
        }).path;
    }


    // OLD CODE THAT MIGHT POTENTIALLY BE USEFUL BELOW //


    /**
     * Plans roads for a remote given the paths to each source.
     * @param {RoomPosition[][]} sourcePaths Paths for this remote obtained using getSourcePaths()
     * @returns {RoomPosition[]} An array of RoomPositions for roads for this remote.
     */
    planRoadsOld(sourcePaths) {

        const allPaths = [];
        sourcePaths.forEach((sourcePath) => allPaths.push(...sourcePath));
        const allRoads = allPaths.sort((a, b) => a.roomName + a.x + a.y > b.roomName + b.x + b.y ? a : b).filter(function(item, pos, arr) {
            return !pos || !item.isEqualTo(arr[pos - 1]);
        });

        return allRoads;
    }

    /**
     * Scores a potential remote for this room.
     * @param {RoomInfo} roomInfo The info object associated with the host room.
     * @param {string} targetName The name of the room to score a remote for. Must have been scouted previously.
     * @param {number} neededCarry The number of hauler parts for this remote to fully transport its produced energy.
     * @param {RoomPosition[]} roads The locations of all roads needed to plan this remote. Should be the array obtained by `planRoads()`.
     * @param {number} containerCount The number of containers needed to plan this remote. Should be the length of the array obtained by `planMiningSites()`.
     * @returns An object with scoring information for this remotes. 
     * Contains a `score` property for energy output and a `cost` property for spawn time.
     */
    scoreRemote(roomInfo, targetName, neededCarry, roads, containerCount) {
        const remoteInfo = Memory.rooms[targetName];

        // Let's calculate some upkeep costs using those newly created paths
        const upkeep = {};

        // Starting with containers, first
        const containerUpkeep = CONTAINER_DECAY / CONTAINER_DECAY_TIME / REPAIR_POWER;
        const totalContainerUpkeep = containerUpkeep * containerCount;
        
        // Then roads, remember that roads built on swamps cost 5x more
        const roadUpkeep = ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME / REPAIR_POWER;
        let totalRoadUpkeep = 0;
        roads.forEach((road) => {
            const terrain = Game.map.getRoomTerrain(road.roomName).get(road.x, road.y);
            totalRoadUpkeep += roadUpkeep * (terrain === TERRAIN_MASK_SWAMP ? CONSTRUCTION_COST_ROAD_SWAMP_RATIO : 1);
        });

        // Total energy upkeep for structures in this room
        upkeep.structures = totalContainerUpkeep + totalRoadUpkeep;

        // Now for creeps spawn costs, total up energy and spawn time upkeeps
        upkeep.creeps = productionSpawnHandler.getUpkeepEstimates(roomInfo, remoteInfo.sources.length, neededCarry);

        // Calculate net energy produced in this room
        const grossEnergy = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME * remoteInfo.sources.length;
        const netEnergy = grossEnergy - (upkeep.structures + upkeep.creeps.energy);

        // Here's the score and cost of this remote so we can calculate which are most important
        return {
            score: netEnergy,
            cost: upkeep.creeps.spawnTime,
        };
    }

    /**
     * Gets paths from remote sources to goals in the homeroom, only allowing planned roads as transport except in the home room.
     * @param {RoomInfo} roomInfo Info for the homeroom.
     * @param {[]} goals An array of goals objects for the pathfinder to use. Should have pos and range attributes. 
     * @param {RoomPosition[]} plannedRoads An array of all planned roads in rooms we expect haulers to traverse through.
     * @param {RoomPosition[]} containerPositions An array of all planned containers in the remote. Haulers will path from these.
     * @returns 
     */
    getHaulerPaths(roomInfo, goals, plannedRoads, containerPositions) {

        // Setup an unwalkable matrix for room we shouldn't go through
        const unwalkable = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                unwalkable.set(x, y, 255);
            }
        }

        // Generate cost matrices for each room we're planning on moving through
        const matrices = { [roomInfo.room.name]: new PathFinder.CostMatrix() };
        plannedRoads.forEach((road) => {
            if (!matrices[road.roomName]) {
                matrices[road.roomName] = unwalkable.clone();
            }
            matrices[road.roomName].set(road.x, road.y, this.planningConstants.roadCost);
        });

        // Make an ordinary matrix for our home room
        roomInfo.room.find(FIND_STRUCTURES).forEach((s) => {
            if (s.structureType === STRUCTURE_ROAD) {
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, this.planningConstants.roadCost);
            }
            else if (s.structureType !== STRUCTURE_CONTAINER &&
                (s.structureType !== STRUCTURE_RAMPART || !s.my)) {
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, 255);
            }
        });

        // Simply path from each container to the goal, only allowing planned roads as transport, except in the home room
        const haulerPaths = [];
        containerPositions.forEach((container) => {
            const result = PathFinder.search(container, goals, {
                // These normally wouldn't be necessary, however we should include them for our home room
                plainCost: this.planningConstants.plainCost,
                swampCost: this.planningConstants.swampCost,

                // Don't allow us to consider any rooms we don't have planned roads for
                roomCallback: function(roomName) {
                    if (matrices[roomName]) {
                        return matrices[roomName];
                    }
                    return false;
                }
            });

            // No path found!
            if (result.incomplete) {
                console.log("No hauler path found in " + container.roomName);
                return;
            }

            haulerPaths.push({ 
                container: container, 
                path: result.path, 
                // Each source gives 10 energy per tick, and hauler is empty on the way back
                // Therefore, 20 * distance / CARRY_CAPACITY
                neededCarry: Math.ceil(20 * result.path.length / CARRY_CAPACITY), 
            });
        });

        return haulerPaths;
    }
}

module.exports = RemotePlanner;