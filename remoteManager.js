const RemotePlanner = require("remotePlanner");
const remotePlanner = new RemotePlanner();

const utility = require("remoteUtility");

const overlay = require("overlay");

class RemoteManager {

    /**
     * Draws enabled overlays for remotes.
     * @param {{}[]} remotes An array of remotes.
     */
    drawOverlay() {
        if (!DEBUG.drawOverlay) {
            return;
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

            // Simplify the plan objects and map the roomName as a key
            // Also filter out construction sites on invalid locations (room transitions)
            // and give each remote an activity status
            const finalPlans = {};
            for (const plan of this.planRemotes(roomInfo)) {
                const roomName = plan.room;
                plan.roads = plan.roads.filter((r) => r.x > 0 && r.x < 49 && r.y > 0 && r.y < 49);
                plan.active = false;
                finalPlans[roomName] = plan;
            }
            utility.setRemotePlans(roomInfo.room.name, finalPlans);
        }
        return utility.getRemotePlans(roomInfo.room.name);
    }

    planRemotes(roomInfo) {
        const cpu = Game.cpu.getUsed();
        const remotes = remotePlanner.planRemotes(roomInfo);

        // Visuals for debugging
        if (DEBUG.drawOverlay) {
            Memory.temp = {};
            if (DEBUG.drawRemoteOwnership) {
                Memory.temp.roads = {};
                for (const remote of remotes) {
                    Memory.temp.roads[remote.source.id] = [];
                    for (const road of remote.roads) {
                        Memory.temp.roads[remote.source.id].push(road);
                    }
                }
            }
            if (DEBUG.drawContainerOverlay) {
                const allContainerPositions = remotes.reduce((containers, current) => containers.concat(current.container), []);
                Memory.temp.containerPositions = allContainerPositions;
            }
        }

        // CPU tracking
        if (DEBUG.logRemotePlanning) {
            console.log("Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu");
            remotes.forEach((remote) => {
                console.log("Source at " + remote.source.pos + " with score: " + remote.score + " and cost: " + remote.cost);
            });
        }

        return remotes;
    }
}

module.exports = RemoteManager;