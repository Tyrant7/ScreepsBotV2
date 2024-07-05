const { onRCLUpgrade } = require("./event.colonyEvents");

onRCLUpgrade.subscribe((roomInfo, newRCL) => {
    const base = Memory.bases[roomInfo.room.name];
    if (!base) {
        return;
    }
    base.rclTimes[newRCL] = Game.time;
});
