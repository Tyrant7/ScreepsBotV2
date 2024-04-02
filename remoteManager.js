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
            // Then, filter out construction sites on invalid locations (room transitions)
            // and give each remote an activity status
            const finalPlans = [];
            for (const plan of this.planRemotes(roomInfo)) {
                plan.roads = plan.roads.filter((r) => r.x > 0 && r.x < 49 && r.y > 0 && r.y < 49);
                plan.active = false;
                finalPlans.push(plan);
            }
            
            utility.setRemotePlans(roomInfo.room.name, finalPlans);
        }

        if (RELOAD) {
            // Let's regenerate our costmatrices for remote creeps using the better pathing system
            const matricesByRoom = {};

            // Since roads have been filtered out of room edges and we're using those to draw our paths,
            // we can't mark them as unwalkable
            const unwalkableMatrix = new PathFinder.CostMatrix();
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                    if (x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                        continue;
                    }
                    unwalkableMatrix.set(x, y, 255);
                }
            }
            const plans = utility.getRemotePlans(roomInfo.room.name);
            for (const plan of plans) {
                for (const road of plan.roads) {
                    // Skip generating a matrix for our base since
                    // we want to be able to path freely through our base's room
                    if (road.roomName === roomInfo.room.name) {
                        continue;
                    }
                    if (!matricesByRoom[road.roomName]) {
                        matricesByRoom[road.roomName] = unwalkableMatrix.clone();
                    }
                    matricesByRoom[road.roomName].set(road.x, road.y, 1);
                }
                matricesByRoom[plan.container.roomName].set(plan.container.x, plan.container.y, 2);
            }
            for (const roomName in matricesByRoom) {
                betterPathing.cacheMatrix(matricesByRoom[roomName], CONSTANTS.pathSets.remote, roomName);
            }
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