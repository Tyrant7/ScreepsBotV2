const periodDuration = 15;

module.exports = function() {
    if (!Memory.stats) {
        Memory.stats = {};
    }
    if (!Memory.stats.rollingAverage) {
        Memory.stats.rollingAverage = Game.cpu.getUsed();
    }
    const used = Game.cpu.getUsed();
    Memory.stats.rollingAverage = ((Memory.stats.rollingAverage * (periodDuration - 1)) + used) / periodDuration;
    return Memory.stats.rollingAverage;
}