const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const overlay = require("overlay");

class RemoteManager {

    run(roomInfo, remainingSpawnCapacity) {
        
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