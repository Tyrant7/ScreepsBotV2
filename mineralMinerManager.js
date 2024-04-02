const CreepManager = require("./creepManager");
const Task = require("./task");

class MineralMinerManager extends CreepManager {
    createTask(creep, roomInfo) {
        const actionStack = [];
        actionStack.push(function(creep, mineralSite) {

            // Move to mining site
            const sitePos = new RoomPosition(mineralSite.pos.x, mineralSite.pos.y, mineralSite.pos.roomName);
            if (creep.pos.getRangeTo(sitePos) > 0) {
                creep.moveTo(sitePos, {
                    range: 0,
                    pathSet: CONSTANTS.pathSets.remote,
                });
            }

            // Mine our mineral
            const extractor = Game.getObjectById(mineralSite.extractorID);
            if (creep.pos.getRangeTo(extractor) <= 1 && !extractor.cooldown) {
                const mineral = Game.getObjectById(mineralSite.mineralID);
                creep.harvest(mineral);
            }

            // Always return false since miners can never finish their task
            return false;
        });

        if (creep.memory.miningSite) {
            return new Task(creep.memory.miningSite, "mine", actionStack);
        }

        // Memorize this site
        const site = roomInfo.getMineralSites()[0];
        creep.memory.miningSite = site;   
        return new Task(site, "mine", actionStack);
    }
}

module.exports = MineralMinerManager;