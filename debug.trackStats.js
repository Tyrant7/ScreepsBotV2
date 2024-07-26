const initializeStats = () => {
    if (!Memory.stats || RELOAD) {
        Memory.stats = {
            cpu: {
                rollingAverage: 0,
                nSamples: 0,
            },
            rcl: {},
        };
    }
};

const trackCPU = () => {
    initializeStats();
    const used = Game.cpu.getUsed();
    Memory.stats.cpu.nSamples++;
    Memory.stats.cpu.rollingAverage =
        (Memory.stats.cpu.rollingAverage * (Memory.stats.cpu.nSamples - 1) +
            used) /
        Memory.stats.cpu.nSamples;
    return Memory.stats.cpu.rollingAverage;
};

const trackRCL = (roomName) => {
    const room = Game.rooms[roomName];
    if (!room) {
        return;
    }

    initializeStats();
    if (!Memory.stats.rcl[roomName]) {
        Memory.stats.rcl[roomName] = {
            initialProgress: room.controller.progress,
            tickTracked: Game.time,
        };
    }

    const progDiff =
        room.controller.progress - Memory.stats.rcl[roomName].initialProgress;
    const timeDiff = Game.time - Memory.stats.rcl[roomName].tickTracked;
    const avgDiff = progDiff / timeDiff;
    return avgDiff;
};

module.exports = {
    trackCPU,
    trackRCL,
};
