const HaulerManager = require("./creep.hauler");
const { roles } = require("./constants");

class StarterHaulerManager extends HaulerManager {
    createTask(creep, roomInfo) {
        // Once we have another hauler up and running, we'll turn this hauler into a scout
        if (roomInfo.haulers.length) {
            creep.memory.role = roles.scout;
            return null;
        }
        return super.createTask(creep, roomInfo);
    }
}

module.exports = StarterHaulerManager;
