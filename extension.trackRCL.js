const { onRCLUpgrade } = require("./event.colonyEvents");

onRCLUpgrade.subscribe((colony, newRCL) => {
    if (!colony.memory.rclTimes) {
        colony.memory.rclTimes = {};
    }
    colony.memory.rclTimes[newRCL] = Game.time;
});
