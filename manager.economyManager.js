const RemoteManager = require("./remote.remoteManager");
const SpawnManager = require("./spawn.spawnManager");

const remoteManager = new RemoteManager();
const spawnManager = new SpawnManager();

const { getSpawnTime } = require("./spawn.spawnUtility");
const { makeReserver } = require("./spawn.creepMaker");

const { onRemoteAdd, onRemoteDrop } = require("./event.colonyEvents");

const overlay = require("./debug.overlay");
const profiler = require("./debug.profiler");

const REACTION_SPEED = 250;
const DROP_THRESHOLD = 0.06;
const ADD_THRESHOLD = 0.085;

class EconomyManager {
    run(colony) {
        //
        // Overall idea:
        // Keep us stable while honing in on our max economic output
        //
        // Responsibilities:
        // Tracking spawn usage
        // Determining when to add/drop remotes and which remotes to sustain
        //

        const lastSpawnUsage = profiler.wrap("spawn manager", () =>
            spawnManager.run(colony)
        );
        profiler.wrap("validate remotes", () =>
            remoteManager.validatePlans(colony)
        );

        // Let's compare our actual spawn usage to our estimates
        // Since we don't want to wait too long to see results,
        // let's just nudge our estimated value in the direction of our spawn's activity
        // We're going to nudge towards the fraction of spawns that we have running currently
        // This should hone in on our actual max spawn capacity over a maximum of REACTION_SPEED ticks
        profiler.startSample("remotes");
        const nudge = 1 / REACTION_SPEED;
        colony.memory.spawnUsage =
            nudge * lastSpawnUsage + (1 - nudge) * colony.memory.spawnUsage;

        // Based on our new estimates, we should be able to add/drop remotes according
        // to what we can or can no longer support
        const maxSpawnUsage = colony.structures[STRUCTURE_SPAWN].length;
        if (colony.memory.spawnUsage > maxSpawnUsage - DROP_THRESHOLD) {
            // Drop a remote each tick until our spawn usage is under the threshold
            const activeRemotes = colony.remotePlans.filter((r) => r.active);
            if (activeRemotes.length) {
                // We don't want to drop a remote that another one depends on, so let's filter for that
                const nonDependants = [];
                for (const remote of activeRemotes) {
                    if (
                        activeRemotes.find((r) =>
                            r.dependants.includes(remote.source.id)
                        )
                    ) {
                        continue;
                    }
                    nonDependants.push(remote);
                }

                // Now let's simply drop the worst non-dependant
                const worst = nonDependants.reduce((worst, curr) => {
                    return worst.score / worst.cost > curr.score / curr.cost
                        ? curr
                        : worst;
                });

                // Let's be sure to update our estimate so don't drop more than necessary
                worst.active = false;
                colony.memory.spawnUsage -= worst.cost;

                // Let depending modules know that we've dropped a remote
                onRemoteDrop.invoke(colony, worst);

                if (DEBUG.logRemoteDropping) {
                    console.log(
                        colony.room.name +
                            " dropping remote: " +
                            worst.source.id +
                            " (" +
                            worst.room +
                            ")"
                    );
                }
            }
        } else if (colony.memory.spawnUsage < maxSpawnUsage - ADD_THRESHOLD) {
            // Add a remote if we can fit any
            const inactiveRemotes = [];
            const activeRemotes = [];
            for (const remote of colony.remotePlans) {
                if (remote.active) {
                    activeRemotes.push(remote);
                    continue;
                }
                inactiveRemotes.push(remote);
            }

            // Keep adding our highest priority remote until we can't support any additional
            if (inactiveRemotes.length) {
                const nextRemote = this.getBestRemote(
                    inactiveRemotes,
                    activeRemotes
                );

                // Validate adding this remote
                if (
                    colony.memory.spawnUsage + nextRemote.cost <=
                    maxSpawnUsage - ADD_THRESHOLD
                ) {
                    nextRemote.active = true;

                    // Update our estimate so we don't add more than necessary
                    colony.memory.spawnUsage += nextRemote.cost;

                    // Let depending modules know that we've added a remote
                    onRemoteAdd.invoke(colony, nextRemote);

                    if (DEBUG.logRemoteDropping) {
                        console.log(
                            colony.room.name +
                                " adding remote: " +
                                nextRemote.source.id +
                                " (" +
                                nextRemote.room +
                                ")"
                        );
                    }
                }
            }
        }
        profiler.endSample("remotes");

        // Display our active remotes
        profiler.startSample("remote overlay");
        this.drawOverlay(colony, colony.memory.spawnUsage);
        remoteManager.drawOverlay(colony);
        profiler.endSample("remote overlay");
    }

    /**
     * Finds the best remote given an array of active and inactive remotes.
     * @param {{}[]} inactiveRemotes Array of inactive remotes.
     * @param {{}[]} activeRemotes Array of active remotes.
     * @returns {{}} The best fit remote currently available.
     */
    getBestRemote(inactiveRemotes, activeRemotes) {
        // Let's make sure to include the cost of a reserver if we aren't already reserving the remote's room
        const reservedRooms = [];
        activeRemotes.forEach((r) => {
            reservedRooms.push(r.room);
        });
        const reserverCost = getSpawnTime(makeReserver().body);
        return inactiveRemotes
            .filter((r) => {
                // Ensure we meet the dependancies of this remote
                for (const depend of r.dependants) {
                    if (
                        !activeRemotes.find(
                            (active) => active.source.id === depend
                        )
                    ) {
                        return false;
                    }
                }
                return true;
            })
            .reduce((best, curr) => {
                const cPenalty = reservedRooms.includes(curr.room)
                    ? 0
                    : reserverCost;
                const bPenalty = reservedRooms.includes(best.room)
                    ? 0
                    : reserverCost;
                return curr.score / (curr.cost + cPenalty) >
                    best.score / (best.cost + bPenalty)
                    ? curr
                    : best;
            });
    }

    /**
     * Adds some info about the active remotes to the overlay, if enabled.
     * @param {Colony} colony The room to draw overlay for.
     */
    drawOverlay(colony, spawnEstimate) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (DEBUG.trackSpawnUsage) {
            const spawnDisplay = spawnEstimate.toFixed(3);
            overlay.addHeading(colony.room.name, "Spawns");
            overlay.addText(colony.room.name, {
                "Spawn Usage":
                    spawnDisplay +
                    " / " +
                    colony.structures[STRUCTURE_SPAWN].length,
            });
        }
        if (DEBUG.trackActiveRemotes) {
            const remoteDisplay = {};
            for (const remote of colony.remotePlans) {
                if (remote.active) {
                    const key = remote.source.id.substring(0, 6);
                    remoteDisplay[key] =
                        " (" + remote.score.toFixed(3) + "E/t)";
                }
            }
            overlay.addHeading(colony.room.name, "Remotes");
            overlay.addText(colony.room.name, remoteDisplay);
        }
    }
}

module.exports = EconomyManager;
