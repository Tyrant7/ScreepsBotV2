const HaulerManager = require("./creep.hauler");
const { roles } = require("./constants");

class StarterHaulerManager extends HaulerManager {
    createTask(creep, colony) {
        // Once we have another hauler up and running, we'll turn this hauler into a scout
        if (colony.haulers.length) {
            creep.memory.role = roles.scout;
            if (creep.store[RESOURCE_ENERGY]) {
                creep.drop(RESOURCE_ENERGY);
            }
            return null;
        }
        return super.createTask(creep, colony);
    }
}

module.exports = StarterHaulerManager;
