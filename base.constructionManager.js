const { getPlan } = require("./base.planningUtility");

const requestSite = (roomInfo) => {
    const plan = getPlan(roomInfo.room.name);
    if (!plan) {
        return;
    }
    console.log("placing site from room plan in " + roomInfo.room.name);
};

module.exports = { requestSite };
