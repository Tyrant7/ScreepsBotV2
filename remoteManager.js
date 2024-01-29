const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const overlay = require("overlay");

class RemoteManager {

    constructor() {
        this.remotePlans = {};
        this.buildTarget = null;
    }

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
        //    - handling placement of construction sites in an efficient order
        //    - ensuring that only one remote per base room is being constructed at a time for efficiency
        //    - handling switching the state when remote is built enough to be efficient
        // -> active: remote is healthy and producing
        //    - handling maintenance if roads become too low or destroyed
        //    - requesting additional haulers if containers overflow
        //    - handle searching for threats in this remote or nearby
        // -> contested: remote is under potential threat
        //    - requesting defenders
        //    - handling of setting certain flags for present miners and haulers to be aware 
        //      and react appropriately by fleeing
        //    - if contest goes on for too long or cost is too great abandon the remote
        // -> abandoned: remote has been captured by an enemy or discarded due to lack of efficiency
        //    - track reason for abandonement
        //    - should handle flagging the room as dangerous and keeping track of the threat if that was the cause
        //    - should also calculate if best course of action is to retake the room or to 
        //      attempt to build a new remote somewhere else once threat has subsided for other rooms


        // Start by tracking active remotes of this room
        if (!Memory.bases[roomInfo.room.name]) {
            Memory.bases[roomInfo.room.name] = {};
            Memory.bases[roomInfo.room.name].remotes = [];
        }
        const activeRemotes = Memory.bases[roomInfo.room.name].remotes;

        if (!this.buildTarget) {
            this.buildTarget = this.getBuildTarget(roomInfo, remainingSpawnCapacity);
        }
        this.buildRemote(this.buildTarget);

        // Overlays
        if (Memory.temp.roads) {
            overlay.circles(Memory.temp.roads);
        }
    }

    getRemotePlans(roomInfo, remainingSpawnCapacity) {

        const cpu = Game.cpu.getUsed();

        // Here's out best combination of remotes and the order they have to be built in
        // Keep in mind that distance 1's are interchangable, so we can use a greedy algorithm 
        // to easily pull the most efficient one
        const bestBranch = remotePlanner.planRemotes(roomInfo, remainingSpawnCapacity).branch;
        if (!bestBranch) {
            return;
        }

        // Track road postions for debugging
        if (DEBUG.drawOverlay) {
            const allRoads = bestBranch.reduce((roads, node) => roads.concat(node.roads), []);
            Memory.temp = {};
            Memory.temp.roads = allRoads.map((road) => { 
                return { x: road.x, y: road.y, roomName: road.roomName };
            });
        }

        // CPU tracking
        if (DEBUG.trackCPUUsage) {
            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            bestBranch.forEach((b) => console.log("Room " + b.name + " with score: " + b.score + " and cost: " + b.cost));
        }

        return bestBranch;
    }

    getBuildTarget(roomInfo, remainingSpawnCapacity) {

        // Get our active remotes
        const activeRemotes = Memory.bases[roomInfo.room.name].remotes;

        // Let's get a plan for all of the remotes we want if we haven't done this already
        if (!this.remotePlans[roomInfo.room.name]) {
            this.remotePlans[roomInfo.room.name] = this.getRemotePlans(roomInfo, remainingSpawnCapacity);
        }
        const plans = this.remotePlans[roomInfo.room.name];

        // We're going to use a simple greedy algorithm to determine the best remote to start with
        // by simply filtering for only ones that can be currently built and taking the highest scoring
        return plans.filter((candidate) => { 
            const canBuild = candidate.parent === roomInfo.room.name 
                          || activeRemotes.includes(candidate.parent);
            const alreadyBuilt = activeRemotes.includes(candidate.room);
            return canBuild && !alreadyBuilt;
        }).reduce((best, curr) => best.score >= curr.score ? best : curr);
    }

    buildRemote(remoteInfo) {
        
        // All wanted remotes must have been built already, so we don't need to do anything
        if (!remoteInfo) {
            return;
        }

        // Plan roads
        const roadBlueprint = remoteInfo.roads;

        // Simply place all of them down
        while(roadBlueprint.length > 0) {
            try {
                const next = roadBlueprint.pop();
                const pos = new RoomPosition(next.x, next.y, next.roomName);
                pos.createConstructionSite(STRUCTURE_ROAD);
                console.log("placed site at: " + pos);
            }
            catch (e) {
                console.log("we're fine");
            }
        }
    }
}

module.exports = RemoteManager;