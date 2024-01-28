const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const overlay = require("overlay");

class RemoteManager {

    run(roomInfo, remainingSpawnCapacity) {
        

        // Responsiblity list:
        //
        // 1. Planning remotes
        // -> remote planner module will handle this part
        //
        // 2. Tracking remote efficiency and printing out an overlay in the base room
        // -> printing remote name, gross energy production, net energy production, 
        //    upkeep, spawn cost, and current creep vs ideal creep counts
        //
        // 3. Tracking states for each remote
        // -> constructing: remote is in progress of being built
        //    - requesting builders
        //    - handling placement of construction sites in a streamlined manner
        //    - ensuring that only one remote per base room is being constructed at a time for efficiency
        // -> active: remote is healthy and producing
        //    - handling maintenance if roads become too low or destroyed
        //    - requesting additional haulers if containers overflow
        //    - handle searching for threats in this remote or nearby
        // -> contested: remote is under potential threat
        //    - requesting defenders
        //    - handling of setting certain flags for present miners and haulers to be aware 
        //      and react appropriately by fleeing
        //    - if contest goes on for too long or cost is too great abandon the remote
        // -> ruined: remote has been abandoned
        //    - should handle flagging the room as dangerous and keeping track of the threat
        //    - should also calculate if best course of action is to retake the room or to 
        //      attempt to build a new remote somewhere else once threat has subsided for other rooms


        this.temporary(roomInfo, remainingSpawnCapacity);
    }

    temporary(roomInfo, remainingSpawnCapacity) {

        // Remote planning logic
        if (Game.time % 15 === 0) {
            const cpu = Game.cpu.getUsed();
            const bestBranch = remotePlanner.planRemotes(roomInfo, remainingSpawnCapacity);

            if (!bestBranch) {
                return;
            }

            const allRoads = bestBranch.branch.reduce((roads, node) => roads.concat(node.roads), []);

            // Save some info for the best branch to memory
            Memory.temp = {};
            Memory.temp.roads = allRoads.map((road) => { 
                return { x: road.x, y: road.y, roomName: road.roomName };
            });

            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            bestBranch.branch.forEach((b) => console.log("Room " + b.name + " with score: " + b.score + " and cost: " + b.cost));
        }
        if (Memory.temp.roads) {
            overlay.circles(Memory.temp.roads);
        }
    }
}

module.exports = RemoteManager;