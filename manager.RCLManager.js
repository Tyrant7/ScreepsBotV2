const Colony = require("./data.colony");
const { onRCLUpgrade } = require("./event.colonyEvents");

/**
 * Raises the `onRCLUpgrade` event if RCL is higher this tick than last tick.
 * @param {Colony} colony The colony to run the event for.
 */
const checkRCL = (colony) => {
    const base = Memory.bases[colony.room.name];
    if (!base) {
        return;
    }
    const lastRCL = base.rcl || 0;
    const currentRCL = colony.room.controller.level;
    if (currentRCL > lastRCL) {
        base.rcl = currentRCL;
        onRCLUpgrade.invoke(colony, currentRCL);
    }
};

module.exports = { checkRCL };
