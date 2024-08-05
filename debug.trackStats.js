const initializeStats = () => {
    if (!Memory.stats || RELOAD) {
        Memory.stats = {
            cpu: undefined,
            rcl: {},
        };
    }
};

const trackCPU = (periodLength) => {
    initializeStats();
    const used = Game.cpu.getUsed();
    if (Memory.stats.cpu) {
        const nudge = 1 / periodLength;
        Memory.stats.cpu = nudge * used + (1 - nudge) * Memory.stats.cpu;
    } else {
        Memory.stats.cpu = used;
    }
    return Memory.stats.cpu;
};

const trackRCL = (roomName, periodLength) => {
    const room = Game.rooms[roomName];
    if (!room) {
        return;
    }

    initializeStats();
    if (!Memory.stats.rcl[roomName]) {
        Memory.stats.rcl[roomName] = {
            lastProgress: room.controller.progress,
        };
        return 0;
    }
    const tickProgress =
        room.controller.progress - Memory.stats.rcl[roomName].lastProgress;
    Memory.stats.rcl[roomName].lastProgress = room.controller.progress;

    if (Memory.stats.rcl[roomName].avgProgress) {
        const nudge = 1 / periodLength;
        Memory.stats.rcl[roomName].avgProgress =
            nudge * tickProgress +
            (1 - nudge) * Memory.stats.rcl[roomName].avgProgress;
    } else {
        Memory.stats.rcl[roomName].avgProgress = tickProgress;
    }
    return Memory.stats.rcl[roomName].avgProgress;
};

module.exports = {
    trackCPU,
    trackRCL,
};
