class RemotePlanner {

    constructor() {
        this.planningConstants = {
            planningPlainCost: 5,
            planningSwampCost: 6,
            plainCost: 2,
            swampCost: 10,
            roadCost: 1,
        };
    }

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
                container:   RoomPosition,
                roads:       RoomPosition[],
                
                neededCarry: number,

                score:       number,
                cost:        number,

                children:    Remote[],
            }

            We can organize sources that share roads with eachother
            Any source that shares roads with a closer source will be considered a "child" of the closer source
            This means that it is always more efficient resource-wise to mine the parent source before the child source,
            and because of this, child sources will only be considered for mining if their parent source is being mined as well
            This also means that when calculating the maintenance costs of mining a child source, the parent's road maintenance 
            cost can be deducted from the maintenance cost of the child since the parent's roads are already being maintained
            This idea also applies for maintenance and spawn costs of reservers when the child source is in the same room as the parent
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

        // Let's sort these sources by distance to our storage
        /*
        const goal = roomInfo.room.storage.pos;
        const scores = {};
        remotes.forEach((remote) => {
            scores[remote.source.id] = PathFinder.search(remote.source.pos, { pos: goal, range: 1 }, {
                maxRooms: 3,
            }).path.length;
        })
        remotes.sort((a, b) => {
            return scores[a.source.id] - scores[b.source.id];
        });
        */

        // Let's plan each route back to our storage
        // As we do this, let's build up a CostMatrix of planned roads 
        // to encourage remotes to combine roads where they can
        for (const remote of remotes) {
            
            // TODO //

        }


        // Once we've planned all of our roads, let's place down containers
        // Let's keep them next to the source, but avoid placing on a road, if possible

        // TODO


        // Additionally, after roads we can easily figure out how much CARRY we'll need to support the income
        // Simply calculate it based on our number of roads to the storage

        // TODO //


        // Next, we can begin structuring our tree of parent-child relationships
        
        // Let's check each of our remotes for overlap of planned roads
        // If this occurs, we'll remove all overlapping planned roads for the further remote
        
        // TODO //


        // Finally, let's determine our score and cost for this source
        // Each source's cost will be the spawn cost to spawn one miner, plus as many haulers as is needed in CARRY parts
        // Each source's score will be determined with a simple equation of:
        // Income - spawnEnergy - maintenanceRoadsAndContainer

        // TODO //


        // We're finished!
        // Return all of our remote plans


        // Traverse this tree from the base upwards when planning roads so we can guarantee that
        // roads from closer remotes exist when planning further remotes
        Object.keys(nearbyRooms).forEach((distOne) => {

            // Make sure it's a valid remote before planning
            if (this.isValidRemote(distOne)) {

                // Let's plan roads for our distOne first to home first
                const distOnePaths = this.getSourcePaths(roomInfo, distOne, []);
                const distOneRoadPositions = this.planRoads(distOnePaths);
                const distOneMiningSites = this.planMiningSites(distOne, distOnePaths);
                const distOneHaulerPaths = this.getHaulerPaths(roomInfo, 
                    { pos: roomInfo.room.storage.pos, range: 1 }, distOneRoadPositions, distOneMiningSites.map((site) => site.pos));
                const distOneNeededCarry = distOneHaulerPaths.reduce((total, curr) => total + curr.neededCarry, 0);
                const scoreCost = this.scoreRemote(roomInfo, distOne, distOneNeededCarry, distOneRoadPositions, distOneMiningSites.length);

                // Then plan roads for each child one this remote
                // Each distOne should have multiple distTwo depending remotes
                nearbyRooms[distOne].forEach((distTwo) => {
                    if (this.isValidRemote(distTwo)) {
                        const distTwoPaths = this.getSourcePaths(roomInfo, distTwo, distOneRoadPositions);
                        const distTwoRoadPositions = this.planRoads(distTwoPaths);
                        const distTwoMiningSites = this.planMiningSites(distTwo, distTwoPaths);
                        const distTwoHaulerPaths = this.getHaulerPaths(roomInfo, 
                            { pos: roomInfo.room.storage.pos, range: 1 }, distTwoRoadPositions.concat(distOneRoadPositions), distTwoMiningSites.map((site) => site.pos));
                        const distTwoNeededCarry = distTwoHaulerPaths.reduce((total, curr) => total + curr.neededCarry, 0);
                        const scoreCost = this.scoreRemote(roomInfo, distTwo, distTwoNeededCarry, distTwoRoadPositions, distTwoMiningSites.length);

                        // Score this remote
                        remotes.push({
                            room: distTwo,
                            score: scoreCost.score,
                            cost: scoreCost.cost,
                            active: false,
                            roads: distTwoRoadPositions,
                            miningSites: distTwoMiningSites,
                            haulerPaths: distTwoHaulerPaths,
                            neededHaulerCarry: distTwoNeededCarry,
                        });
                    }
                });

                // Populate this tree node
                remotes.push({
                    room: distOne,
                    score: scoreCost.score,
                    cost: scoreCost.cost,
                    active: false,
                    roads: distOneRoadPositions,
                    miningSites: distOneMiningSites,
                    haulerPaths: distOneHaulerPaths,
                    neededHaulerCarry: distOneNeededCarry,
                });
            }
        });

        // Return all possible remotes for us so we can hand pick them later
        return remotes;
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
     * Plans roads for a remote given the paths to each source.
     * @param {RoomPosition[][]} sourcePaths Paths for this remote obtained using getSourcePaths()
     * @returns {RoomPosition[]} An array of RoomPositions for roads for this remote.
     */
    planRoads(sourcePaths) {

        const allPaths = [];
        sourcePaths.forEach((sourcePath) => allPaths.push(...sourcePath));
        const allRoads = allPaths.sort((a, b) => a.roomName + a.x + a.y > b.roomName + b.x + b.y ? a : b).filter(function(item, pos, arr) {
            return !pos || !item.isEqualTo(arr[pos - 1]);
        });

        return allRoads;
    }

    /**
     * Plans containers for a remote given the roads and room name.
     * @param {string} targetName The name of the remote room.
     * @param {RoomPosition[][]} sourcePaths Paths for this remote obtained using getSourcePaths()
     * @returns {RoomPosition[]} An array of RoomPositions for containers for this remote.
     */
    planMiningSites(targetName, sourcePaths) {
        const remoteInfo = Memory.rooms[targetName];

        // Look for spaces around each source where we can place a container
        // Ideally we place them next to roads, but not directly on top of them
        const containers = [];
        remoteInfo.sources.forEach((source) => {

            // Figure out which source path matches this source
            const matchingPath = sourcePaths.find((path) => path[0].getRangeTo(source.pos.x, source.pos.y) <= 1);

            // Push the first step of the path
            containers.push({
                pos: matchingPath[0],
                sourceID: source.id,
            });
        });
        return containers;
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
     * Draws paths between a remote's sources and controllers and the nearest road in its host room.
     * @param {RoomInfo} roomInfo The info object associated with the host room.
     * @param {string} targetName The name of the room to remote.
     * @param {RoomPosition[]} plannedRoads If this remote is greater than distance one, 
     * this will be the planned road array for the distance one remote this one relies on.
     * @returns An array of arrays of RoomPositions between each source and the nearest road in the host room.
     * Each element corresponds to a unique path.
     */
    getSourcePaths(roomInfo, targetName, plannedRoads) {
        const remoteInfo = Memory.rooms[targetName];

        // Build cost matrices to include all of our planned roads
        // These should only be from the dependant room
        const matrices = { [roomInfo.room.name]: new PathFinder.CostMatrix(),
                           [targetName]: new PathFinder.CostMatrix() };
        plannedRoads.forEach((road) => {
            if (!matrices[road.roomName]) {
                matrices[road.roomName] = new PathFinder.CostMatrix();
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

        // Our goals is to find roads in our starting room to connect into
        const goals = roomInfo.room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_ROAD } }).map((road) => {
            return { pos: road.pos, range: 1 };
        });

        // Let's find paths to each source in the room
        const sourceResults = [];
        remoteInfo.sources.forEach(source => {
            const sourcePos = new RoomPosition(source.pos.x, source.pos.y, targetName);
            const result = PathFinder.search(sourcePos, goals, {
                plainCost: this.planningConstants.planningPlainCost,
                swampCost: this.planningConstants.planningSwampCost,

                // If we don't have planned roads for this room, 
                // return false so we don't consider it
                roomCallback: function(roomName) {
                    if (matrices[roomName]) {
                        return matrices[roomName];
                    }
                    return false;
                }
            });

            // If we're missing any paths this won't work, return early
            if (result.incomplete) {
                console.log("No source path found in " + targetName);
                return;
            }

            // Let's update our cost matrices with these new paths so that 
            // they can be reused when pathing to other sources
            result.path.forEach((point) => {
                if (!matrices[point.roomName]) {
                    matrices[point.roomName] = new PathFinder.CostMatrix();
                }    
                matrices[point.roomName].set(point.x, point.y, this.planningConstants.roadCost);
            });

            // Store calculated path
            sourceResults.push(result.path);
        });

        return sourceResults;
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