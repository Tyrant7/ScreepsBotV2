const DefenderManager = require("./creep.defender");
const Task = require("./data.task");

class ColonizerDefenderManager extends DefenderManager {
    createTask(creep, colony) {
        if (creep.memory.expansionTarget === creep.room.name) {
            if (creep.room.controller.my) {
                creep.memory.home = creep.room.name;
            }

            const firstEnemy = colony.room.find(FIND_CREEPS).find((c) => !c.my);
            if (firstEnemy) {
                console.log(firstEnemy);
                return super.createKillTask(creep, firstEnemy);
            }

            // We'll wait until our room has been claimed
            return;
        }
        return this.createMoveTask(creep);
    }

    createDefendTask() {}

    createMoveTask(creep) {
        const actionStack = [this.basicActions.moveToRoom];
        return new Task(
            {
                roomName: creep.memory.expansionTarget,
                maxRooms: 64,
                maxOps: 64000,
            },
            "move",
            actionStack
        );
    }
}

module.exports = ColonizerDefenderManager;
