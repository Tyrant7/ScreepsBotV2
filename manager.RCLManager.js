const RoomInfo = require("./data.roomInfo");
const { onRCLUpgrade } = require("./event.colonyEvents");

/**
 * Raises the `onRCLUpgrade` event if RCL is higher this tick than last tick.
 * @param {RoomInfo} roomInfo The colony to run the event for.
 */
const checkRCL = (roomInfo) => {
    const base = Memory.bases[roomInfo.room.name];
    if (!base) {
        return;
    }
    const lastRCL = base.rcl || 0;
    const currentRCL = roomInfo.room.controller.level;
    if (currentRCL > lastRCL) {
        base.rcl = currentRCL;
        onRCLUpgrade.invoke(roomInfo, currentRCL);
    }
};

module.exports = { checkRCL };
