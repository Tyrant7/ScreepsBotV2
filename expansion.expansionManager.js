const { roles, ROOM_SIZE } = require("./constants");

const runExpansion = () => {
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
        spawns: [roles.claimer, roles.colonizerBuilder, roles.colonizerHauler],
    };
    Memory.newColonies[best] = entry;

    if (DEBUG.logColonization) {
        console.log("Beginning colonization of room " + best);
    }
};

const hasFreeGCL = () =>
    Object.keys(Memory.colonies).length +
        Object.keys(Memory.newColonies).length <
    Game.gcl.level;

module.exports = {
    runExpansion,
};
