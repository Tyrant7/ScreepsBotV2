const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const utility = require("remoteUtility");

const overlay = require("overlay");

class RemoteManager {

    run(roomInfo) {
        
        if (Game.cpu.bucket < 1000) {
            console.log("Bucket is low: " + Game.cpu.bucket);
            return;
        }

        console.log("Planning remotes...")
        const cpuTest = Game.cpu.getUsed();
        const remotes = remotePlanner.planRemotes(roomInfo);
        this.drawOverlays(remotes);

        Memory.tempRemotes = remotes;

        console.log("We used: " + (Game.cpu.getUsed() - cpuTest) + " cpu to plan remotes!");
        return;

        // Get our plans
        const remotePlans = this.ensurePlansExist(roomInfo);
        if (!remotePlans) {
            return 0;
        }

        // Display our active remotes
        if (DEBUG.trackSpawnUsage) {
            const remoteDisplay = {};
            for (const remoteRoom in remotePlans) {
                remoteDisplay[remoteRoom] = remotePlans[remoteRoom].active 
                    ? "active (" + (Math.round(remotePlans[remoteRoom].cost * 1000) / 1000).toFixed(3) + ")" 
                    : "inactive";
            }
            overlay.addText(roomInfo.room.name, remoteDisplay);
        }
    }

    drawOverlays(remotes) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (!Memory.temp) {
            Memory.temp = {};
        }
        if (RELOAD) {            
            Memory.temp.roads = {};
            Memory.temp.containerPositions = [];
            for (const remote of remotes) {
                Memory.temp.roads[remote.source.id] = [];
                for (const road of remote.roads) {
                    Memory.temp.roads[remote.source.id].push(road);
                }
                Memory.temp.containerPositions.push(remote.container);
            }
        }
        if (DEBUG.drawRemoteOwnership && Memory.temp.roads) {
            const colours = [
                "#FF0000",
                "#00FF00",
                "#0000FF",
                "#FFFF00",
                "#00FFFF",
                "#FF00FF",
            ];
            let i = 0;
            for (const remote in Memory.temp.roads) {
                for (const road of Memory.temp.roads[remote]) {
                    overlay.circles([road], { fill: colours[i % colours.length], radius: 0.25 });
                }
                i++;
            }
        }
        if (DEBUG.drawContainerOverlay && Memory.temp.containerPositions) {
            overlay.rects(Memory.temp.containerPositions);
        }
    }

    /**
     * Plan our remotes, if we haven't already.
     * @param {RoomInfo} roomInfo Info object for the room to plan remotes for.
     * @returns The active plans for remotes for this room.
     */
    ensurePlansExist(roomInfo) {
        if (!utility.getRemotePlans(roomInfo.room.name) || (RELOAD && DEBUG.replanRemotesOnReload)) {
            const unsortedPlans = this.planRemotes(roomInfo);

            // Sort plans by distance, then efficiency score to allow creeps to be assigned under a natural priority 
            // of more important (i.e. higher scoring and closer) remotes
            const sortedPlans = unsortedPlans.sort((a, b) => {
                const aScore = (a.children.length ? 100000 : 0) + a.score;
                const bScore = (b.children.length ? 100000 : 0) + b.score;
                return bScore - aScore;
            });

            // Simplify the plan objects and map the roomName as a key
            // Also filter out construction sites on invalid locations
            const finalPlans = {};
            for (const plan of sortedPlans) {
                const roomName = plan.room;
                plan.roads = plan.roads.filter((r) => r.x > 0 && r.x < 49 && r.y > 0 && r.y < 49);
                finalPlans[roomName] = plan;
            }
            utility.setRemotePlans(roomInfo.room.name, finalPlans);
        }
        return utility.getRemotePlans(roomInfo.room.name);
    }

    planRemotes(roomInfo) {

        const cpu = Game.cpu.getUsed();

        // Here's best combination of remotes and the order they have to be built in
        // Keep in mind that distance 1's are interchangable, so we can use a greedy algorithm 
        // to easily pull the most efficient one
        const bestBranch = remotePlanner.planRemotes(roomInfo);
        if (!bestBranch) {
            return;
        }

        // Track road postions for debugging
        if (DEBUG.drawOverlay) {
            if (DEBUG.drawRoadOverlay) {
                const allRoads = bestBranch.reduce((roads, node) => roads.concat(node.roads), []);     
                Memory.temp.roadVisuals = allRoads;
            }
            if (DEBUG.drawPathOverlay) {
                const allHaulerPaths = [];
                bestBranch.forEach((node) => allHaulerPaths.push(...node.haulerPaths));
                Memory.temp.haulerPaths = allHaulerPaths;
            }
            if (DEBUG.drawContainerOverlay) {
                const allContainerPositions = bestBranch.reduce((containers, node) => containers.concat(node.miningSites.map((site) => site.pos)), []);
                Memory.temp.containerPositions = allContainerPositions;
            }
        }

        // CPU tracking
        if (DEBUG.logRemotePlanning) {
            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            bestBranch.forEach((b) => console.log("Room " + b.room + " with score: " + b.score + " and cost: " + b.cost));
            const totalCost = bestBranch.reduce((usage, node) => usage + node.cost, 0);
            console.log("Total spawn usage after remotes: " + (totalCost));
        }

        return bestBranch;
    }
}

module.exports = RemoteManager;