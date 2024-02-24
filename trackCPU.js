module.exports = function() {
    if (!Memory.stats) {
        Memory.stats = {};
    }
    if (!Memory.stats.rollingAverage) {
        Memory.stats.rollingAverage = 0;
        Memory.stats.nSamples = 0;
    }
    const used = Game.cpu.getUsed();
    Memory.stats.nSamples++;
    Memory.stats.rollingAverage = ((Memory.stats.rollingAverage * (Memory.stats.nSamples - 1)) + used) / Memory.stats.nSamples;
    return Memory.stats.rollingAverage;
}