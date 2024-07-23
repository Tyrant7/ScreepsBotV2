const { roles, ROOM_SIZE } = require("./constants");

class ExpansionManager {
    run() {
        this.expandIfPossible();
        this.handleExpansions();
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
                Memory.colonies[colony].supporting.push(best);
                supporters.push(colony);
            }
        }

        // And create an entry for it in our global colonization spot
        const entry = {
            created: Game.time,
            supporters: supporters,
            creepCounts: {},
        };
        Memory.newColonies[best] = entry;

        if (DEBUG.logColonization) {
            console.log("Beginning colonization of room " + best);
        }
    }

    handleExpansions() {
        // We'll give every expansion a list of creeps that belong to it
        for (const expansion in Memory.newColonies) {
            Memory.newColonies[expansion].creepCounts = {};
        }
        for (const creep of Game.creeps) {
            const expansion = Memory.newColonies[creep.memory.expansionTarget];
            if (!expansion) continue;
            expansion.creepCounts[creep.memory.role] =
                (expansion.creepCounts[creep.memory.role] || 0) + 1;
        }
    }
}

const hasFreeGCL = () =>
    Object.keys(Memory.colonies).length +
        Object.keys(Memory.newColonies).length <
    Game.gcl.level;

module.exports = ExpansionManager;
