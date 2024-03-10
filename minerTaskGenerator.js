const Task = require("task");

class MinerTaskGenerator {

    run(creep, roomInfo, activeTasks) {

        // Generate default miner behaviour -> miners only behave in one specific way
        const actionStack = [];
        actionStack.push(function(creep, miningSite) {

            // Extremely simple here

            // Move to mining site
            const sitePos = new RoomPosition(miningSite.pos.x, miningSite.pos.y, miningSite.pos.roomName);
            if (creep.pos.getRangeTo(sitePos) > 0) {
                creep.moveTo(sitePos);
            }

            // Mine our source
            const source = Game.getObjectById(miningSite.sourceID);
            if (creep.pos.getRangeTo(source) <= 1) {
                creep.harvest(source);
            }

            // Always return false since miners can never finish their task
            return false;
        });

        if (creep.memory.miningSite) {
            return new Task(creep.memory.miningSite, "mine", actionStack);
        }

        const unreserved = roomInfo.getFirstUnreservedMiningSite();
        if (unreserved.length === 0) {
            // Wait for an opening
            // TODO //
            // Fix this so that early replacement can function
            return null;
        }

        // Mark this site as reserved
        creep.memory.miningSite = unreserved;
        return new Task(unreserved, "mine", actionStack);
    }
}

module.exports = MinerTaskGenerator;