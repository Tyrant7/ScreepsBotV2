const runExpansion = () => {
    if (!hasFreeGCL()) return;

    console.log("free GCL!");
};

const hasFreeGCL = () => Object.keys(Memory.colonies).length < Game.gcl.level;

module.exports = {
    runExpansion,
};
