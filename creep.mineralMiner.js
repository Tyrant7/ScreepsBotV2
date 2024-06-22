const { pathSets, CREEP_PATHING_COST } = require("./constants");
const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");

class MineralMinerManager extends CreepManager {
    createTask(creep, roomInfo) {
        const actionStack = [];
        actionStack.push(function (creep, mineralSite) {
            // Move to mining site
            const sitePos = new RoomPosition(
                mineralSite.pos.x,
                mineralSite.pos.y,
                mineralSite.pos.roomName
            );
            if (creep.pos.getRangeTo(sitePos) > 0) {
                creep.betterMoveTo(sitePos, {
                    range: 0,
                    pathSet: pathSets.default,
                });
            }

            // Mine our mineral
            const extractor = Game.getObjectById(mineralSite.extractorID);
            if (creep.pos.getRangeTo(extractor) <= 1 && !extractor.cooldown) {
                const mineral = Game.getObjectById(mineralSite.mineralID);
                creep.harvest(mineral);

                // We'll also mark this position to discourage creeps from walking through it
                updateCachedPathMatrix(
                    pathSets.default,
                    creep.room.name,
                    creep.pos.x,
                    creep.pos.y,
                    CREEP_PATHING_COST
                );
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
