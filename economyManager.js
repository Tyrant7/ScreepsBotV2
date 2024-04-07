const RemoteManager = require("./remoteManager");
const SpawnManager = require("./spawnManager");

const remoteManager = new RemoteManager();
const spawnManager = new SpawnManager();

const creepSpawnUtility = require("./creepSpawnUtility");
const creepMaker = require("./creepMaker");

const remoteUtility = require("./remoteUtility");
const overlay = require("./overlay");

const REACTION_SPEED = CREEP_LIFE_TIME / 2;
const DROP_THRESHOLD = 0.06;
const ADD_THRESHOLD = 0.085;

class EconomyManager {

    run(roomInfo) {

        //
        // Overall idea: 
        // Keep us stable while honing in on our max economic output
        //
        // Responsibilities:
        // Tracking spawn usage
        // Determining when to add/drop remotes and which remotes to sustain
        //

        // Validate our base
        const base = Memory.bases[roomInfo.room.name];
        if (!base) {
            return;
        }

        // Ensure valid remote plans
        remoteManager.ensurePlansExist(roomInfo);

        // We're get our estimated remotes that we can support the first time that this is run
        // After that we'll just get back our cached estimated spawn usage which we manipulate directly further down
        const lastSpawnEstimate = this.estimateSpawnUsage(roomInfo);

        // Run the spawn manager to spawn everything necessary to support what's currently active
        // This number will represent the fraction of spawns that are active this tick
        // At higher RCLs, if we have multiple spawns, we'll get even higher numbers like 2 and 3
        const spawnUsageThisTick = spawnManager.trackSpawns(roomInfo);

        // Let's compare our actual spawn usage to our estimates    
        // Since we don't want to wait too long to see results, 
        // let's just nudge our estimated value in the direction of our spawn's activity
        // We're going to nudge towards the fraction of spawns that we have running currently
        // This should hone in on our actual max spawn capacity over a maximum of REACTION_SPEED ticks
        const nudge = 1 / REACTION_SPEED;
        base.spawnUsage = nudge * spawnUsageThisTick + (1 - nudge) * lastSpawnEstimate;

        // Based on our new estimates, we should be able to add/drop remotes according
        // to what we can or can no longer support
        const maxSpawnUsage = roomInfo.spawns.length;
        const remotes = remoteUtility.getRemotePlans(roomInfo.room.name);
        if (base.spawnUsage > maxSpawnUsage - DROP_THRESHOLD) {

            // Drop a remote each tick until our spawn usage is under the threshold
            const activeRemotes = remotes.filter((r) => r.active);
            if (activeRemotes.length) {
                // We don't want to drop a remote that another one depends on, so let's filter for that
                const nonDependants = [];
                for (const remote of activeRemotes) {
                    if (activeRemotes.find((r) => r.dependants.includes(remote.source.id))) {
                        continue;
                    }
                    nonDependants.push(remote);
                }

                // Now let's simply drop the worst non-dependant
                const worst = nonDependants.reduce((worst, curr) => {
                    return worst.score / worst.cost > curr.score / curr.cost ? curr : worst;
                });

                // Let's be sure to update our estimate so don't drop more than necessary
                worst.active = false;
                base.spawnUsage -= worst.cost;
                if (DEBUG.logRemoteDropping) {
                    console.log(roomInfo.room.name + " dropping remote: " + worst.source.id + " (" + worst.room + ")");
                }
            }
        }
        else if (base.spawnUsage < maxSpawnUsage - ADD_THRESHOLD) {
            // Add a remote if we can fit any
            const inactiveRemotes = [];
            const activeRemotes = [];
            for (const remote of remotes) {
                if (remote.active) {
                    activeRemotes.push(remote);
                    continue;
                }
                inactiveRemotes.push(remote);
            }

            // Keep adding our highest priority remote until we can't support any additional
            if (inactiveRemotes.length) {
                const nextRemote = this.getBestRemote(inactiveRemotes, activeRemotes);

                // Validate adding this remote
                if (base.spawnUsage + nextRemote.cost <= maxSpawnUsage - ADD_THRESHOLD) {
                    nextRemote.active = true;
    
                    // Update our estimate so we don't add more than necessary
                    base.spawnUsage += nextRemote.cost;
                    if (DEBUG.logRemoteDropping) {
                        console.log(roomInfo.room.name + " adding remote: " + nextRemote.source.id + " (" + nextRemote.room + ")");
                    }
                }
            }
        }

        // Display our active remotes
        this.drawOverlay(roomInfo, remotes, base.spawnUsage);
        remoteManager.drawOverlay(roomInfo);
    }

    /**
     * Estimates spawn usage for this room and as many remotes as it can support. If not cached value, 
     * also estimates which remotes this room can support and marks them as active in Memory.
     * @param {roomInfo} roomInfo The room to estimate for.
     * @returns {number} The spawn usage after remotes and main room have been accounted for. 
     * Should be less than, but very close to the number of spawns in this room.
     */
    estimateSpawnUsage(roomInfo) {

        // If we already have estimates, just use those
        const base = Memory.bases[roomInfo.room.name];
        if (base.spawnUsage && !(RELOAD && DEBUG.replanRemotesOnReload)) {
            return base.spawnUsage;
        }

        // Let's aim to maximize our output
        const usageGoal = roomInfo.spawns.length;

        // Estimate our main room's spawn usage for things like energy distribution, building, and mining
        // This estimation can be very rough, since it will change a lot depending on things like
        // storage fullness, construction, military activity, and other room-state things
        let totalSpawnUsage = 0.25;

        // Estimate which remotes we can have active based on our current economy
        // This estimation will usually be above our actual value, so we'll be dropping remotes in the future
        const remotes = remoteManager.ensurePlansExist(roomInfo);
        const inactiveRemotes = [];
        const activeRemotes = [];
        for (const remote of remotes) {
            remote.active = false;
            inactiveRemotes.push(remote);
        }
        // Keep adding our highest priority remote until we can't support any additional
        while (inactiveRemotes.length) {
            const nextRemote = this.getBestRemote(inactiveRemotes, activeRemotes);

            // Validate adding this remote
            if (totalSpawnUsage + nextRemote.cost > usageGoal - DROP_THRESHOLD) {
                break;
            }
            activeRemotes.push(nextRemote);
            inactiveRemotes.splice(inactiveRemotes.indexOf(nextRemote), 1);
            nextRemote.active = true;
            totalSpawnUsage += nextRemote.cost;
        }

        // Cache
        base.spawnUsage = totalSpawnUsage;
        return totalSpawnUsage;
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
        const reserverCost = creepSpawnUtility.getSpawnTime(creepMaker.makeReserver().body);
        return inactiveRemotes.filter((r) => {
            // Ensure we meet the dependancies of this remote
            for (const depend of r.dependants) {
                if (!activeRemotes.find((active) => active.source.id === depend)) {
                    return false;
                }
            }
            return true;
        }).reduce((best, curr) => {
            const cPenalty = reservedRooms.includes(curr.room) ? 0 : reserverCost;
            const bPenalty = reservedRooms.includes(best.room) ? 0 : reserverCost;
            return curr.score / (curr.cost + cPenalty) > best.score / (best.cost + bPenalty) ? curr : best;
        });
    }

    /**
     * Adds some info about the active remotes to the overlay, if enabled.
     * @param {RoomInfo} roomInfo The room to draw overlay for.
     * @param {{}[]} remotes Array of remotes planned by that room.
     */
    drawOverlay(roomInfo, remotes, spawnEstimate) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (DEBUG.trackSpawnUsage) {
            const spawnDisplay = spawnEstimate.toFixed(3);
            overlay.addHeading(roomInfo.room.name, "- Spawns -");
            overlay.addText(roomInfo.room.name, { "Spawn Usage": spawnDisplay + " / " + roomInfo.spawns.length });
        }
        if (DEBUG.trackActiveRemotes) {
            const remoteDisplay = {};
            for (const remote of remotes) {
                if (remote.active) {
                    const key = remote.source.id.substring(0, 6);
                    remoteDisplay[key] = " (" + remote.score.toFixed(3) + "E/t)";
                }
            }
            overlay.addHeading(roomInfo.room.name, "- Remotes -");
            overlay.addText(roomInfo.room.name, remoteDisplay);
        }
    }
}

module.exports = EconomyManager;