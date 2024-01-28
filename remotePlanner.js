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
                const goals = roomInfo.room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_ROAD } })
                    .map((road) => { return { pos: road.pos, range: 1 } });
                const distOnePaths = this.getRemotePaths(roomInfo, distOne, goals);
                const distOneRoadPositions = this.planRoads(distOnePaths);
                const scoreCost = this.scoreRemote(roomInfo, distOne, distOnePaths, distOneRoadPositions.length);

                // Then plan roads for each child one this remote
                // Each distOne should have multiple distTwo depending remotes
                const children = [];
                nearbyRooms[distOne].forEach((distTwo) => {
                    if (this.isValidRemote(distTwo)) {
                        const goals = distOneRoadPositions.map(roadPos => { return { pos: roadPos, range: 1 } });
                        const distTwoPaths = this.getRemotePaths(roomInfo, distTwo, goals);
                        const distTwoRoadPositions = this.planRoads(distTwoPaths);
                        const scoreCost = this.scoreRemote(roomInfo, distTwo, distTwoPaths, distTwoRoadPositions.length);
    
                        // Score this remote
                        children.push({
                            name: distTwo,
                            score: scoreCost.score,
                            cost: scoreCost.cost,
                            roads: distTwoRoadPositions,
                            children: []
                        });
                    }
                });

                // Populate this tree node
                remotes.push({
                    name: distOne,
                    score: scoreCost.score,
                    cost: scoreCost.cost,
                    roads: distOneRoadPositions,
                    children: children,
                });
            }
        });

        // Get our combination of remotes with the highest score, algorithm explained below
        return this.traverseRecursively(remotes, maxSpawnCapacity, 0);
    }

    /**
     * Plans roads for a remote in the room matching roomName with a dependant.
     * @param {{}} remotePaths Paths for this remote obtained using getRemotePaths()
     */
    planRoads(remotePaths) {

        const allPaths = [...remotePaths.controllerPath];
        remotePaths.sourcePaths.forEach((sourcePath) => allPaths.push(...sourcePath));
        const allRoads = allPaths.sort((a, b) => a.roomName + a.x + a.y > b.roomName + b.x + b.y ? a : b).filter(function(item, pos, arr) {
            return !pos || !item.isEqualTo(arr[pos - 1]);
        });

        return allRoads;
    }

    /**
     * Scores a potential remote for this room.
     * @param {RoomInfo} roomInfo The info object associated with the host room.
     * @param {string} targetName The name of the room to score a remote for. Must have been scouted previously.
     * @param {{}} remotePaths Paths for this remote obtained using `getRemotePaths()`.
     * @param {number} roadCount The number of roads needed to plan this remote. Should be the length of the array obtained by `planRoads()`.
     * @returns An object with scoring information for this remotes. 
     * Contains a `score` property for energy output and a `cost` property for spawn time.
     */
    scoreRemote(roomInfo, targetName, remotePaths, roadCount) {
        const remoteInfo = Memory.rooms[targetName];

        // Let's calculate some upkeep costs using those newly created paths
        const upkeep = {};

        // Starting with containers, first
        const containerUpkeep = CONTAINER_DECAY / CONTAINER_DECAY_TIME / REPAIR_POWER;
        const totalContainerUpkeep = containerUpkeep * remoteInfo.sources.length;
        
        // Then roads, for this we can combine all paths and remove duplicate path positions
        const roadUpkeep = ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME / REPAIR_POWER;
        const totalRoadUpkeep = roadUpkeep * roadCount;

        // Total energy upkeep for structures in this room
        upkeep.structures = totalContainerUpkeep + totalRoadUpkeep;

        // Now for creeps spawn costs, total up energy and spawn time upkeeps
        upkeep.creeps = remoteSpawnHandler.getUpkeepCosts(roomInfo, remoteInfo, remotePaths);

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
     * @param {{}[]} goals Goal objects for the pathfinder, these should be somewhere in the dependant room.
     * @returns An object with 2 properties: 
     * - `controllerPath`: an array of RoomPosition objects between the controller and nearest road in the host room.
     * - `sourcesPaths`: an array of arrays of RoomPositions between each source and the nearest road in the host room.
     * Each element corresponds to a unique path.
     */
    getRemotePaths(roomInfo, targetName, goals) {
        const remoteInfo = Memory.rooms[targetName];

        // Make our cost matrix, setting structures as unwalkable,
        // We don't have to worry about roads since those are our targets
        const costMatrix = new PathFinder.CostMatrix();
        roomInfo.room.find(FIND_STRUCTURES).forEach(function(s) {
            if (s.structureType !== STRUCTURE_CONTAINER &&
                (s.structureType !== STRUCTURE_RAMPART || !s.my)) {
                costMatrix.set(s.pos.x, s.pos.y, 255);
            }
        });
        function getCostMatrix(roomName) {
            if (roomName === roomInfo.room.name) {
                return costMatrix;
            }
            // Since we can't actually see into the room we're planning for, we'll have to
            // trust that there aren't any structures blocking our path
            // TODO //
            // Have scouts track structures as well and use those when drawing our path
            return new PathFinder.CostMatrix();
        }

        // Let's get a path from the remote's controller to the closest existing road in the dependant room
        const controllerPos = new RoomPosition(remoteInfo.controller.pos.x, remoteInfo.controller.pos.y, targetName);
        const controllerResult = PathFinder.search(controllerPos, goals, {
            roomCallback: getCostMatrix,
        });

        // We need a full path for the rest of the steps
        if (controllerResult.incomplete) {
            console.log("could not complete path in: " + targetName + ", dumping info...");
            console.log("controllerPos: " + controllerPos);
            console.log("ops: " + controllerResult.ops);
            console.log("cost: " + controllerResult.cost);
            console.log("path: ");
            controllerResult.path.forEach((point) => console.log(point));
            console.log("goals: ");
            goals.forEach((goal) => console.log(goal.pos));

            return;
        }

        // Let's append all of our paths from our controller path to our source paths to allow them to combine paths
        // This will result in minor pathing efficiency detriments, but will also allow us to save on upkeep costs
        goals.push(...controllerResult.path.map((path) => { return { pos: path, range: 1 } }));

        // Next, let's do the same thing but for the remote's sources
        const sourceResults = [];
        remoteInfo.sources.forEach(source => {
            const sourcePos = new RoomPosition(source.pos.x, source.pos.y, targetName);
            const result = PathFinder.search(sourcePos, goals, {
                roomCallback: getCostMatrix,
            });
            sourceResults.push(result);

            // Push path to allow sources to share path segments as well
            // This will result in minor pathing efficiency detriments, but will also allow us to save on upkeep costs
            goals.push(...result.path.map((path) => { return { pos: path, range: 1 } }));
        });

        // Same thing for sources
        for (const result of sourceResults) {
            if (result.incomplete) {
                return;
            }
        }

        return {
            controllerPath: controllerResult.path,
            sourcePaths: sourceResults.map((r) => r.path),
        };
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

    createRemote() {

    }
}

module.exports = RemotePlanner;