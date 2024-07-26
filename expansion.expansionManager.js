const { roles, ROOM_SIZE } = require("./constants");
const { wrap } = require("./debug.profiler");

class ExpansionManager {
    run() {
        wrap("expand", this.expandIfPossible);
        wrap("handle", this.handleExpansions);
    }

    expandIfPossible() {
        if (!hasFreeGCL()) return;

        // Validate that we actually have any data
        const d = Memory.scoutData;
        if (!Object.keys(d).length) return;

        // Let's find our best choice
        const best = Object.keys(d).reduce((best, curr) =>
            d[curr].expansionScore > d[best].expansionScore ? curr : best
        );

        // For this choice, we'll also let all colonies within range of it
        // know that they'll be supporting it
        // We'll store a two-way connection here for debugging purposes
        const supporters = [];
        for (const colony in Memory.colonies) {
            const route = Game.map.findRoute(colony, best);
            const maxSupportDist = CREEP_CLAIM_LIFE_TIME / ROOM_SIZE;
            if (route.length <= maxSupportDist) {
                if (!Memory.colonies[colony].supporting) {
                    Memory.colonies[colony].supporting = [];
                }
                if (!Memory.colonies[colony].supporting.includes(best)) {
                    Memory.colonies[colony].supporting.push(best);
                }
                supporters.push(colony);
            }
        }

        // And create an entry for it in our global colonization spot
        const entry = {
            created: Game.time,
            supporters: supporters,
            spawnDemands: {
                [roles.claimer]: 1,
                [roles.colonizerBuilder]: 2,
                [roles.colonizerDefender]: 1,
            },
            creepNamesAndRoles: [],
        };
        Memory.newColonies[best] = entry;

        // After this, we'll clear all expansion scores since they're now out of date
        for (const room in Memory.scoutData) {
            delete Memory.scoutData[room].expansionScore;
        }

        if (DEBUG.logColonization) {
            console.log("Beginning colonization of room " + best);
        }
    }

    handleExpansions() {
        // Make sure our colonies are aware of their own creeps for spawn tracking
        for (const expansion in Memory.newColonies) {
            // Filter out the creeps that we think we own to only include creeps that are still alive
            Memory.newColonies[expansion].creepNamesAndRoles =
                Memory.newColonies[expansion].creepNamesAndRoles.filter(
                    (c) => Game.creeps[c.name]
                );

            // If we've claimed this room, we can remove the claimer from its spawn demand
            if (Memory.colonies[expansion]) {
                Memory.newColonies[expansion].spawnDemands[roles.claimer] = 0;
            }
        }
    }
}

const hasFreeGCL = () =>
    Object.keys(Memory.colonies).length +
        Object.keys(Memory.newColonies).length <
    Game.gcl.level;

module.exports = ExpansionManager;
