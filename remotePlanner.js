const RemoteSpawnHandler = require("remoteSpawnHandler");

const remoteSpawnHandler = new RemoteSpawnHandler();
const scoutingUtility = require("scoutingUtility");

class RemotePlanner {

    /**
     * Plans remotes for a room. Returns early if not enough rooms have been scouted.
     * @param {RoomInfo} roomInfo The associated room info object.
     * @param {number} maxSpawnCapacity The maximum allowed spawn capacity of the room to plan remotes for. 
     */
    planRemotes(roomInfo, maxSpawnCapacity) {

        // If we haven't even scouted our own room, we definitely shouldn't plan remotes
        if (!Memory.rooms[roomInfo.room.name]) {
            return;
        }

        // Let's check that all rooms within a range of 3 have been scouted
        const unexplored = scoutingUtility.searchForUnexploredRoomsNearby(roomInfo.room.name, 3);
        if (unexplored) {
            return;
        }

        // Now, let's find all rooms within range 2
        // Organize them in a tree-like structure 
        //     { }
        //    /   \
        //   1     1
        //  / \   / \
        // 2   2 2   2
        const nearbyRooms = {};
        const exits = Object.values(Game.map.describeExits(roomInfo.room.name));
        for (const room of exits) {
            const exitsOfExits = Object.values(Game.map.describeExits(room)).filter((exit) => exit !== roomInfo.room.name);
            nearbyRooms[room] = exitsOfExits;
        }

        // Now we're going to build a new tree structure a little bit differently to the one above
        const remotes = [];

        // Traverse this tree from the base upwards when planning roads so we can guarantee that
        // roads from closer remotes exist when planning further remotes
        Object.keys(nearbyRooms).forEach((distOne) => {

            // Make sure it's a valid remote before planning
            if (this.isValidRemote(distOne)) {

                // Let's plan roads for our distOne first to home first
                const distOnePaths = this.getSourcePaths(roomInfo, distOne, []);
                const distOneRoadPositions = this.planRoads(distOnePaths);
                const distOneContainerPositions = this.planContainers(distOne, distOnePaths);
                const distOneHaulerPaths = this.getHaulerPaths(roomInfo, 
                    { pos: roomInfo.room.storage.pos, range: 1 }, distOneRoadPositions, distOneContainerPositions);
                const distOneNeededCarry = distOneHaulerPaths.reduce((total, curr) => total + curr.neededCarry, 0);
                const scoreCost = this.scoreRemote(roomInfo, distOne, distOneNeededCarry, distOneRoadPositions.length, distOneContainerPositions.length);

                // Then plan roads for each child one this remote
                // Each distOne should have multiple distTwo depending remotes
                const children = [];
                nearbyRooms[distOne].forEach((distTwo) => {
                    if (this.isValidRemote(distTwo)) {
                        const distTwoPaths = this.getSourcePaths(roomInfo, distTwo, distOneRoadPositions);
                        const distTwoRoadPositions = this.planRoads(distTwoPaths);
                        const distTwoContainerPositions = this.planContainers(distTwo, distTwoPaths);
                        const distTwoHaulerPaths = this.getHaulerPaths(roomInfo, 
                            { pos: roomInfo.room.storage.pos, range: 1 }, distTwoRoadPositions.concat(distOneRoadPositions), distTwoContainerPositions);
                        const distTwoNeededCarry = distTwoHaulerPaths.reduce((total, curr) => total + curr.neededCarry, 0);
                        const scoreCost = this.scoreRemote(roomInfo, distTwo, distTwoNeededCarry, distTwoRoadPositions.length, distTwoContainerPositions.length);

                        // Score this remote
                        children.push({
                            room: distTwo,
                            score: scoreCost.score,
                            cost: scoreCost.cost,
                            roads: distTwoRoadPositions,
                            containers: distTwoContainerPositions,
                            haulerPaths: distTwoHaulerPaths,
                            neededHaulerCarry: distTwoNeededCarry,
                            children: [],
                        });
                    }
                });

                // Populate this tree node
                remotes.push({
                    room: distOne,
                    score: scoreCost.score,
                    cost: scoreCost.cost,
                    roads: distOneRoadPositions,
                    containers: distOneContainerPositions,
                    haulerPaths: distOneHaulerPaths,
                    neededHaulerCarry: distOneNeededCarry,
                    children: children,
                });
            }
        });

        // Get our combination of remotes with the highest score, algorithm explained below
        return this.traverseRecursively(remotes, maxSpawnCapacity, 0).branch;
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
    planContainers(targetName, sourcePaths) {
        const remoteInfo = Memory.rooms[targetName];

        // Look for spaces around each source where we can place a container
        // Ideally we place them next to roads, but not directly on top of them
        const containers = [];
        remoteInfo.sources.forEach((source) => {

            // Figure out which source path matches this source
            const matchingPath = sourcePaths.find((path) => path[0].getRangeTo(source.pos.x, source.pos.y) <= 1);

            // Push the first step of the path
            containers.push(matchingPath[0]);
        });
        return containers;
    }

    /**
     * Scores a potential remote for this room.
     * @param {RoomInfo} roomInfo The info object associated with the host room.
     * @param {string} targetName The name of the room to score a remote for. Must have been scouted previously.
     * @param {number} neededCarry The number of hauler parts for this remote to fully transport its produced energy.
     * @param {number} roadCount The number of roads needed to plan this remote. Should be the length of the array obtained by `planRoads()`.
     * @param {number} containerCount The number of containers needed to plan this remote. Should be the length of the array obtained by `planContainers()`.
     * @returns An object with scoring information for this remotes. 
     * Contains a `score` property for energy output and a `cost` property for spawn time.
     */
    scoreRemote(roomInfo, targetName, neededCarry, roadCount, containerCount) {
        const remoteInfo = Memory.rooms[targetName];

        // Let's calculate some upkeep costs using those newly created paths
        const upkeep = {};

        // Starting with containers, first
        const containerUpkeep = CONTAINER_DECAY / CONTAINER_DECAY_TIME / REPAIR_POWER;
        const totalContainerUpkeep = containerUpkeep * containerCount;
        
        // Then roads, for this we can combine all paths and remove duplicate path positions
        const roadUpkeep = ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME / REPAIR_POWER;
        const totalRoadUpkeep = roadUpkeep * roadCount;

        // Total energy upkeep for structures in this room
        upkeep.structures = totalContainerUpkeep + totalRoadUpkeep;

        // Now for creeps spawn costs, total up energy and spawn time upkeeps
        upkeep.creeps = remoteSpawnHandler.getUpkeepEstimates(roomInfo, remoteInfo, neededCarry);

        // Calculate net energy produced in this room
        const grossEnergy = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME * remoteInfo.sources.length;
        const netEnergy = grossEnergy - (upkeep.structures + upkeep.creeps.energy);

        // We're going to allocate a little bit of extra cost to this remote for the energy in produces
        // This is for the home room to be able to use the energy we produce here
        // We'll use a simple formula of the cost to spawn a single WORK part for each energy we produce each tick
        upkeep.creeps.spawnTime += Math.floor(netEnergy) * CREEP_SPAWN_TIME / CREEP_LIFE_TIME;

        // Here's the score and cost of this remote so we can calculate which are most important
        return {
            score: netEnergy,
            cost: upkeep.creeps.spawnTime,
        };
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

        // Owned by another player
        if (!remoteInfo.controller || remoteInfo.controller.owner) {
            return false;
        }

        // No sources
        if (!remoteInfo.sources || !remoteInfo.sources.length) {
            return false;
        }

        // Too dangerous
        if ((remoteInfo.sourceKeepers && remoteInfo.sourceKeepers.length) || 
            (remoteInfo.keeperLairs && remoteInfo.keeperLairs.length)) {
            return false;
        }

        // Stronghold
        if (remoteInfo.invaderCores && remoteInfo.invaderCores.length) {
            return false;
        }
        return true;
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

            // TODO //
            // Include some way of tracking vestigal structures from previous owners 
            // for planned rooms as well

            matrices[road.roomName].set(road.x, road.y, 1);
        });

        // Make an ordinary matrix for our home room
        roomInfo.room.find(FIND_STRUCTURES).forEach((s) => {
            if (s.structureType === STRUCTURE_ROAD) {
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, 1);
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
                // TODO //
                // Constants for these elsewhere
                plainCost: 2,
                swampCost: 10,

                // If we don't have planned roads for this room, 
                // we don't want to walk in it and we'll get `undefined` back
                roomCallback: function(roomName) {
                    return matrices[roomName];
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
                matrices[point.roomName].set(point.x, point.y, 1);
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
            matrices[road.roomName].set(road.x, road.y, 1);
        });

        // Make an ordinary matrix for our home room
        roomInfo.room.find(FIND_STRUCTURES).forEach((s) => {
            if (s.structureType === STRUCTURE_ROAD) {
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, 1);
            }
            else if (s.structureType !== STRUCTURE_CONTAINER &&
                (s.structureType !== STRUCTURE_RAMPART || !s.my)) {
                matrices[roomInfo.room.name].set(s.pos.x, s.pos.y, 255);
            }
        });

        function getCostMatrix(roomName) {
            if (matrices[roomName]) {
                return matrices[roomName];
            }
            return unwalkable;
        }

        // Simply path from each container to the goal, only allowing planned roads as transport, except in the home room
        const haulerPaths = [];
        containerPositions.forEach((container) => {
            const result = PathFinder.search(container, goals, {
                // These normally wouldn't be necessary, however we should include them for our home room
                plainCost: 2,
                swampCost: 10,
                roomCallback: getCostMatrix,
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


    /**
     * Traverses a tree of remotes in a specific way in order to find the branch with the highest score.
     * The steps are as follows:
     * - For each node we can currently access, let's search its first child, sum its score and cost with our current total, 
     * then recursively search the list again, excluding this node and including all of its children
     * - Once we exceed our cost threshold, we can back up one step and record this branch's score, checking it against our highest score
     * - From here time we should access the second available node, and so on until all children have been checked
     * - At this point we should know the highest score and can return the corresponding branch
     * @param {[]} choices An array of objects. Each object should have a parameter `children` which is an 
     * array of any number of objects with the property `children`.
     * Each object should also have a cost and a score.
     * @param {number} remainingCost The max cost before a branch is cut. 
     * @param {number} score The current score of this branch.
     * @returns An object with the following properties: 
     * - The score of the highest scoring branch
     * - The cost of the highest scoring branch
     * - The rooms that make up the highest scoring branch
     */
    traverseRecursively(choices, remainingCost, score) {

        // Leaf node, return score and empty branch
        if (remainingCost <= 0) {
            return {
                score: score,
                branch: [],
                leafNode: true,
            };
        }

        // Track best option available
        let bestScore = 0;
        let bestBranch = [];

        // Search each of our current choices
        choices.forEach((choice) => {

            // Pass children recusively
            const nextChoices = choices.filter((c) => c !== choice).concat(choice.children);
            const result = this.traverseRecursively(nextChoices, remainingCost - choice.cost, score + choice.score);

            // Adjust score to be correct for leaf nodes
            if (result.leafNode) {
                result.score -= choice.score;
            }

            // If this choice beats our current one, let's track the score and append it and its best children
            if (!bestBranch || result.score > bestScore) {
                bestScore = result.score;
                bestBranch = result.branch;

                // Don't push the choice that resulted in a leaf node, since it exceeds our allowed cost
                if (!result.leafNode) {
                    bestBranch.push(choice);
                }
            }
        });

        return {
            score: score,
            branch: bestBranch,
            leafNode: false,
        };
    }
}

module.exports = RemotePlanner;