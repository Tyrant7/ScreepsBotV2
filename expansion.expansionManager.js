const { roles } = require("./constants");

const runExpansion = () => {
    if (!hasFreeGCL()) return;

    // Let's find our best choice
    const d = Memory.scoutData;
    const best = Object.keys(d).reduce((best, curr) =>
        d[curr].expansionScore > d[best].expansionScore ? curr : best
    );

    // And create an entry for it in our global colonization spot
    const entry = {
        roomName: best,
        created: Game.time,
        spawns: [roles.claimer, roles.colonyStarter, roles.hauler],
    };
    Memory.colonizationTargets.push(entry);

    if (DEBUG.logColonization) {
        console.log("Beginning colonization of room " + best);
    }
};

const hasFreeGCL = () =>
    Object.keys(Memory.colonies).length + Memory.colonizationTargets.length <
    Game.gcl.level;

module.exports = {
    runExpansion,
};
