const Colony = require("./data.colony");

const RemotePlanner = require("./remote.remotePlanner");
const remotePlanner = new RemotePlanner();

const utility = require("./remote.remoteUtility");
const { pathSets, REPLAN_REMOTE_INTERVAL, ROOM_SIZE } = require("./constants");
const { cachePathMatrix } = require("./extension.betterPathing");
const { getScoutingData } = require("./scouting.scoutingUtility");
const { getSpawnTime } = require("./spawn.spawnUtility");
const { makeReserver } = require("./spawn.creepMaker");
const { onRemoteAdd, onRemoteDrop } = require("./event.colonyEvents");

const overlay = require("./debug.overlay");
const profiler = require("./debug.profiler");

/**
 * This will be the cost to path outside of our planned roads.
 * In this case, 100 times more than doing it, which will result
 * in CPU savings when pathing in remotes
 */
const OUTSIDE_PATH_COST = 100;

class RemoteManager {
    /**
     * Runs remote code for the given colony.
     * @param {Colony} colony The colony to run remote code for.
     */
    run(colony) {
        this.validatePlans(colony);
        this.drawOverlay(colony);

        // If we have more than one site that can hold more miners,
        // let's consider dropping our worst remote
        const openSites = colony.miningSites.filter((site) =>
            colony.canSiteHoldAdditionalMiners(site)
        );

        // To avoid dropping tons of sites we can actually support due to
        // invaders or other threats on our better choices, let's not drop anymore sites while we still
        // have obsolete remotes being mined
        const obsoleteRemotes = colony.remotePlans.filter(
            (r) =>
                !r.active &&
                colony.miners.find(
                    (m) =>
                        m.memory.miningSite &&
                        m.memory.miningSite.sourceID === r.source.id
                )
        );
        if (openSites.length - obsoleteRemotes.length > 1) {
            this.dropRemote(colony);
            return;
        }

        // Otherwise, if we have no open mining sites We have no open mining sites,
        // let's consider adding a remote
        if (openSites.length - obsoleteRemotes.length <= 0) {
            this.addRemote(colony);
        }
    }

    addRemote(colony) {
        // Group remotes by activity status
        const inactiveRemotes = [];
        const activeRemotes = [];
        for (const remote of colony.remotePlans) {
            if (remote.active) {
                activeRemotes.push(remote);
                continue;
            }
            inactiveRemotes.push(remote);
        }

        // We already have all of our remotes
        if (!inactiveRemotes.length) return;

        const best = this.getBestPlannedRemote(
            inactiveRemotes,
            activeRemotes,
            colony.remoteRooms
        );
        best.active = true;

        // Raise the event so other modules know that we've added a remote
        onRemoteAdd.invoke(colony, best);

        // Log it
        if (DEBUG.logRemoteDropping) {
            console.log(
                `${colony.room.name} adding remote ${worst.source.id} in room ${worst.room}`
            );
        }
    }

    dropRemote(colony) {
        const activeRemotes = colony.remotePlans.filter((r) => r.active);
        if (!activeRemotes.length) return;

        // We don't want to drop a remote that another one depends on, so let's filter for that
        const nonDependants = activeRemotes.filter(
            (remote) =>
                !activeRemotes.find((r) =>
                    r.dependants.includes(remote.source.id)
                )
        );

        // Now we can simply drop the worst non-dependant
        const worst = _.min(nonDependants, (r) => r.score / r.cost);
        worst.active = false;

        // Raise the event so other modules know that we've dropped a remote
        onRemoteDrop.invoke(colony, worst);

        // Log it
        if (DEBUG.logRemoteDropping) {
            console.log(
                `${colony.room.name} dropping remote ${worst.source.id} in room ${worst.room}`
            );
        }
    }

    /**
     * Finds the best inactive remote given an array of active and inactive remotes.
     * @param {{}[]} inactiveRemotes Array of inactive remotes.
     * @param {{}[]} activeRemotes Array of active remotes.
     * @param {string[]} reservedRooms Array of room names of planned reserved rooms.
     * @returns {{}} The best fit remote currently available.
     */
    getBestPlannedRemote(inactiveRemotes, activeRemotes, reservedRooms) {
        // Let's make sure to include the cost of a reserver if we aren't already reserving the remote's room
        const reserverCost = getSpawnTime(makeReserver().body);
        const validRemotes = inactiveRemotes.filter((r) => {
            // Ensure we meet the dependancies of this remote
            for (const depend of r.dependants) {
                if (
                    !activeRemotes.find((active) => active.source.id === depend)
                ) {
                    return false;
                }
            }
            return true;
        });
        return _.max(validRemotes, (r) => {
            const penalty = reservedRooms.includes(r.room) ? 0 : reserverCost;
            return r.score / (r.cost + penalty);
        });
    }

    /**
     * Plan our remotes, if we haven't already.
     * @param {Colony} colony Info object for the room to plan remotes for.
     * @returns The active plans for remotes for this room.
     */
    validatePlans(colony) {
        // If we've recently discovered new rooms, let's replan our remotes
        profiler.startSample("validate rooms");
        const remoteRooms = utility.getPotentialRemoteRooms(
            colony.room.name,
            utility.isValidRemoteRoom
        );
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
            for (const plan of colony.remotePlans) {
                if (!matricesByRoom[plan.room]) {
                    matricesByRoom[plan.room] = new PathFinder.CostMatrix();

                    // Since roads have been filtered out of room edges and we're using those to draw our paths,
                    // we can't mark edges as unwalkable
                    const terrain = Game.map.getRoomTerrain(plan.room);
                    for (let x = 0; x < ROOM_SIZE; x++) {
                        for (let y = 0; y < ROOM_SIZE; y++) {
                            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                                continue;
                            }
                            // We also shouldn't change terrain weights, either, to avoid walking into walls
                            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                                continue;
                            }

                            // We'll heavily discourage searching outside of the planned path, but not forbid it
                            // to still allow us to pickup dropped energy outside of our path set
                            matricesByRoom[plan.room].set(
                                x,
                                y,
                                OUTSIDE_PATH_COST
                            );
                        }
                    }
                }

                for (const road of plan.roads) {
                    // Skip generating a matrix for our base since
                    // we want to be able to path freely through our base's room
                    if (road.roomName === colony.room.name) {
                        continue;
                    }
                    // Road's won't only be in their own rooms
                    if (!matricesByRoom[road.roomName]) {
                        matricesByRoom[road.roomName] =
                            new PathFinder.CostMatrix();
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

    /**
     * Plans remotes for the current colony. Also records appropriate debug info given active settings.
     * @param {Colony} colony The colony to plan remotes for.
     * @returns {{}[]} The newly planned remotes.
     */
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

    /**
     * Draws enabled overlays for remotes.
     * @param {{}[]} remotes An array of remotes.
     */
    drawOverlay(colony) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        //#region World Space
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
        //#endregion

        //#region Panels
        const activeRemotes = colony.remotePlans.filter((r) => r.active);
        if (!activeRemotes.length) return;

        overlay.addHeading(colony.room.name, "Remotes");
        for (const remote of activeRemotes) {
            overlay.addColumns(
                colony.room.name,
                `${remote.source.id.substring(0, 5)} (${remote.room})`,
                ""
            );
        }
    }
}

module.exports = RemoteManager;
