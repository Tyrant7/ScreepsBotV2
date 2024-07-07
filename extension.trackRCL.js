const { onRCLUpgrade } = require("./event.colonyEvents");

onRCLUpgrade.subscribe((colony, newRCL) => {
    const base = Memory.bases[colony.room.name];
    if (!base) {
        return;
    }
    if (!base.rclTimes) {
        base.rclTimes = {};
    }
    base.rclTimes[newRCL] = Game.time;
});
