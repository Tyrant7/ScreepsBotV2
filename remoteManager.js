const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const overlay = require("overlay");

class RemoteManager {

    constructor() {
        this.remotePlans = {};
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


        // Plan our remotes, if we haven't already
        const roomName = roomInfo.room.name;
        if (!this.remotePlans[roomName]) {
            const unsortedPlans = this.getRemotePlans(roomInfo, remainingSpawnCapacity);

            // Sort plans by distance, then efficiency score to allow creeps to be assigned under a natural priority 
            // of more important (i.e. higher scoring and closer) remotes
            this.remotePlans[roomName] = unsortedPlans.sort((a, b) => {
                const aScore = (a.children.length ? 100000 : 0) + a.score;
                const bScore = (b.children.length ? 100000 : 0) + b.score;
                return bScore - aScore;
            });
        }
        const plans = this.remotePlans[roomName];

        if (!Memory.bases[roomName]) {
            Memory.bases[roomName] = {};
        }

        if (!Memory.bases[roomName].remotes) {
            Memory.bases[roomName].remotes = [];
            plans.forEach((remote) => Memory.bases[roomName].remotes.push({ 
                room: remote.room, 
                state: CONSTANTS.remoteStates.constructing,
            }));
        }

        // Let's update each remote's state in memory so that remote creeps know where to go and how to react
        plans.forEach((remote) => {

            // Let's remove all roads that have already been built or have a construction site from this plan
            remote.roads = remote.roads.filter((road) => {
                const room = Game.rooms[road.roomName];
                if (room) {
                    const sites = room.lookForAt(road.x, road.y, LOOK_CONSTRUCTION_SITES);
                    const roads = room.lookForAt(road.x, road.y, LOOK_STRUCTURES, { filter: { structureType: STRUCTURE_ROAD } });
                    return sites.length === 0 && roads.length === 0;
                } 
            });

            const match = Memory.bases[roomName].remotes.find((r) => r.room === remote.room);
            match.state = this.getState(remote);
            this.handleRemote(roomInfo, remote, match.state);
        });

        // Overlays
        if (this.roadVisuals) {
            overlay.circles(this.roadVisuals);
        }
    }

    getRemotePlans(roomInfo, remainingSpawnCapacity) {

        const cpu = Game.cpu.getUsed();

        // Here's out best combination of remotes and the order they have to be built in
        // Keep in mind that distance 1's are interchangable, so we can use a greedy algorithm 
        // to easily pull the most efficient one
        const bestBranch = remotePlanner.planRemotes(roomInfo, remainingSpawnCapacity);
        if (!bestBranch) {
            return;
        }

        // Track road postions for debugging
        if (DEBUG.drawOverlay) {
            const allRoads = bestBranch.reduce((roads, node) => roads.concat(node.roads), []);     
            this.roadVisuals =  allRoads.map((road) => { 
                return { x: road.x, y: road.y, roomName: road.roomName };
            });
        }

        // CPU tracking
        if (DEBUG.trackCPUUsage) {
            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            bestBranch.forEach((b) => console.log("Room " + b.room + " with score: " + b.score + " and cost: " + b.cost));
        }

        return bestBranch;
    }

    getState(remoteInfo) {

        // TODO //

        return CONSTANTS.remoteStates.constructing;
    }

    handleRemote(roomInfo, remoteInfo, state) {

        // TODO //
        // Other states

        if (state === CONSTANTS.remoteStates.constructing) {
            this.handleConstruction(roomInfo, remoteInfo);
        }
    }

    handleConstruction(roomInfo, remoteInfo) {

        // Request a builder if we have fewer than the number of sources in this room
        const unassignedBuilders = roomInfo.remoteBuilders.filter((builder) => !builder.memory.targetRoom);
        const currentBuilders = roomInfo.remoteBuilders.filter((builder) => builder.memory.targetRoom === remoteInfo.room);
        const wantedBuilderCount = Math.max(Memory.rooms[remoteInfo.room].sources.length, 0);
        while (wantedBuilderCount > currentBuilders.length && unassignedBuilders.length > 0) {
            const found = unassignedBuilders.pop();
            if (found) {
                found.memory.targetRoom = remoteInfo.room;
                currentBuilders.push(found);
            }
        }

        // Now let's handle construction sites
        // We should ideally keep nBuilders + 1 sites active at a time
        const room = Game.rooms[remoteInfo.room];
        if (room) {

            // Let's place the wanted site currently closest to an arbirary source
            const source = room.find(FIND_SOURCES)[0];
            const wantedSites = remoteInfo.roads.sort((a, b) => {
                return source.pos.getRangeTo(b) - source.pos.getRangeTo(a);
            });
            while (wantedSites.length <= currentBuilders.length + 1 && wantedSites.length > 0) {
                const next = wantedSites.pop();
                const sitePos = new RoomPosition(next.x, next.y, next.roomName);
                sitePos.createConstructionSite(STRUCTURE_ROAD);
            }

            // Finally, when we have fewer things left to build than the number of builders assigned to this room, 
            // even after creating more sites, it means that there is nothing left to build and we can mark the extra builders for reassignment
            while (room.find(FIND_CONSTRUCTION_SITES).length < currentBuilders.length) {
                const extra = currentBuilders.pop();
                delete extra.memory.targetRoom;
            }
        }

        // Let's take a simple approach to making sure the inside our main room are built by simply placing all of them
        // Our aggressive base building allocation should take care of this quite easily
        remoteInfo.roads.forEach((pos) => {
            if (pos.roomName === roomInfo.room.name) {
                const sitePos = new RoomPosition(pos.x, pos.y, pos.roomName);
                sitePos.createConstructionSite(STRUCTURE_ROAD);
            }
        });
    }
}

module.exports = RemoteManager;