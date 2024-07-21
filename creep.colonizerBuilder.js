const BuilderManager = require("./creep.builder");
const Task = require("./data.task");

class ColonizerBuilderManager extends BuilderManager {
    createTask(creep, colony) {
        if (creep.memory.target === creep.room.name) {
            if (creep.room.controller.my) {
                creep.memory.home = creep.room.name;
                return this.developmentLogisics();
            }
            // We'll wait until our room has been claimed
            return;
        }
        return this.createMoveTask(creep);
    }

    developmentLogisics(creep, colony) {
        if (colony.room.controller.level < 2 && !colony.room.safemode) {
            return this.createUpgradeTask(colony);
        }

        const spawnSite = colony.constructionSites.find(
            (s) => s.structureType === STRUCTURE_SPAWN
        );
        if (spawnSite) {
            return super.createBuildTask(colony, creep, spawnSite);
        }
    }

    createUpgradeTask(colony) {
        const actionStack = [
            function (creep, data) {
                if (creep.pos.getRangeTo(creep.room.controller.pos) > 3) {
                    creep.betterMoveTo(creep.room.controller, { range: 3 });
                    return false;
                }
                creep.upgradeController(creep.room.controller);
                colony.createDropoffRequest(
                    Infinity,
                    RESOURCE_ENERGY,
                    creep.id
                );
                if (colony.room.controller.level >= 2) {
                    return true;
                }
            },
        ];
        return new Task({}, "upgrade", actionStack);
    }

    createMoveTask(creep) {
        const actionStack = [super.basicActions.moveToRoom];
        return new Task(
            { roomName: creep.memory.target, maxRooms: 64, maxOps: 64000 },
            "move",
            actionStack
        );
    }
}

module.exports = ColonizerBuilderManager;
