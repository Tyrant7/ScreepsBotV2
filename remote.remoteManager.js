const RemotePlanner = require("./remote.remotePlanner");
const remotePlanner = new RemotePlanner();

const utility = require("./remote.remoteUtility");
const { pathSets, REPLAN_REMOTE_INTERVAL, ROOM_SIZE } = require("./constants");
const { cachePathMatrix } = require("./extension.betterPathing");

const overlay = require("./debug.overlay");
const profiler = require("./debug.profiler");
const { getScoutingData } = require("./scouting.scoutingUtility");

/**
 * This will be the cost to path outside of our planned roads.
 * In this case, 100 times more than doing it, which will result
 * in CPU savings when pathing in remotes
 */
const OUTSIDE_PATH_COST = 100;

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
                    overlay.circles([road], {
                        fill: colours[i % colours.length],
                        radius: 0.25,
                    });
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
     * @param {Colony} colony Info object for the room to plan remotes for.
     * @returns The active plans for remotes for this room.
     */
    validatePlans(colony) {
        // If we've recently discovered new rooms, let's replan our remotes
        profiler.startSample("validate rooms");
        const remoteRooms = utility.getPotentialRemoteRooms(colony.room.name);
        const existingPlans = colony.remotePlans;
        let shouldReplan =
            !existingPlans || Game.time % REPLAN_REMOTE_INTERVAL === 0;
        if (!shouldReplan) {
            for (const room of remoteRooms) {
                // If we're lacking scouting data, we'll skip this room
                if (!getScoutingData(room)) {
                    continue;
                }
                // If we already have a plan for this room, we can skip it as well
                if (existingPlans.find((plan) => plan.room === room)) {
                    continue;
                }
                // Otherwise, we should replan remotes since we're missing potential
                shouldReplan = true;
                break;
            }
        }
        profiler.endSample("validate rooms");

        if (shouldReplan || (RELOAD && DEBUG.replanRemotesOnReload)) {
            // Then, filter out construction sites on invalid locations (room transitions)
            // and give each remote an activity status
            const finalPlans = [];
            for (const plan of this.planRemotes(colony)) {
                plan.roads = plan.roads.filter(
                    (r) => r.x > 0 && r.x < 49 && r.y > 0 && r.y < 49
                );
                // If we already had planned remotes, let's ensure that their activity status is kept
                const wasActive =
                    existingPlans &&
                    existingPlans.find(
                        (r) => r.source.id === plan.source.id && r.active
                    );
                plan.active = !!wasActive;
                finalPlans.push(plan);
            }

            utility.setRemotePlans(colony.room.name, finalPlans);
            colony.remotePlans = finalPlans;
        }

        if (RELOAD) {
            // Let's regenerate our costmatrices for remote creeps using the better pathing system
            const matricesByRoom = {};

            // Since roads have been filtered out of room edges and we're using those to draw our paths,
            // we can't mark them as unwalkable
            const unwalkableMatrix = new PathFinder.CostMatrix();
            for (let x = 0; x < ROOM_SIZE; x++) {
                for (let y = 0; y < ROOM_SIZE; y++) {
                    if (x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                        continue;
                    }
                    // We'll heavily discourage searching outside of the planned path, but not forbid it
                    // to still allow us to pickup dropped energy outside of our path set
                    unwalkableMatrix.set(x, y, OUTSIDE_PATH_COST);
                }
            }
            for (const plan of colony.remotePlans) {
                for (const road of plan.roads) {
                    // Skip generating a matrix for our base since
                    // we want to be able to path freely through our base's room
                    if (road.roomName === colony.room.name) {
                        continue;
                    }
                    if (!matricesByRoom[road.roomName]) {
                        matricesByRoom[road.roomName] =
                            unwalkableMatrix.clone();
                    }
                    matricesByRoom[road.roomName].set(road.x, road.y, 1);
                }
                matricesByRoom[plan.container.roomName].set(
                    plan.container.x,
                    plan.container.y,
                    4
                );
            }
            for (const roomName in matricesByRoom) {
                cachePathMatrix(
                    matricesByRoom[roomName],
                    pathSets.default,
                    roomName
                );
            }
        }

        return colony.remotePlans;
    }

    planRemotes(colony) {
        const cpu = Game.cpu.getUsed();
        const remotes = remotePlanner.planRemotes(colony);

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
                const allContainerPositions = remotes.reduce(
                    (containers, current) =>
                        containers.concat(current.container),
                    []
                );
                Memory.temp.containerPositions = allContainerPositions;
            }
        }

        // CPU tracking
        if (DEBUG.logRemotePlanning) {
            console.log(
                "Planned remotes with: " + (Game.cpu.getUsed() - cpu) + " cpu"
            );
            remotes.forEach((remote) => {
                console.log(
                    "Source at " +
                        remote.source.pos +
                        " with score: " +
                        remote.score +
                        " and cost: " +
                        remote.cost
                );
            });
        }

        return remotes;
    }
}

module.exports = RemoteManager;
