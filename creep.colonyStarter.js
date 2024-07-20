const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");

class ColonyStarterManager extends CreepManager {
    createTask(creep, colony) {
        if (creep.memory.target === creep.room.name) {
            if (
                creep.room.controller.owner &&
                creep.room.controller.owner.username === ME
            ) {
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

        if (!colony.structures[STRUCTURE_SPAWN]) {
            // Build the spawn
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
            },
        ];
        return new Task({}, "upgrade", actionStack);
    }

    createBuildTask(creep, colony) {}

    createMoveTask(creep) {
        const actionStack = [super.basicActions.moveToRoom];
        return new Task(
            { roomName: creep.memory.target, maxRooms: 64, maxOps: 64000 },
            "move",
            actionStack
        );
    }
}

module.exports = ColonyStarterManager;
