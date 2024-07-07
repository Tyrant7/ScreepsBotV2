const { onRCLUpgrade } = require("./event.colonyEvents");

onRCLUpgrade.subscribe((roomInfo, newRCL) => {
    const base = Memory.bases[roomInfo.room.name];
    if (!base) {
        return;
    }
    if (!base.rclTimes) {
        base.rclTimes = {};
    }
    base.rclTimes[newRCL] = Game.time;
});
