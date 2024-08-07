const { pathSets } = require("./constants");
const DefenderManager = require("./creep.defender");
const Task = require("./data.task");

class ColonizerDefenderManager extends DefenderManager {
    createTask(creep, colony) {
        if (creep.memory.mission === creep.room.name) {
            if (creep.room.controller.my) {
                creep.memory.home = creep.room.name;
            }

            const firstEnemy = creep.room.find(FIND_CREEPS).find((c) => !c.my);
            if (firstEnemy) {
                return super.createKillTask(creep, firstEnemy);
            }

            // Don't patrol until we're owned by this colony
            if (!creep.room.controller.my) return;

            // Sit near our spawn where most of our creeps will be
            const spawnSite = colony.constructionSites.find(
                (s) => s.structureType === STRUCTURE_SPAWN
            );
            const idleTarget =
                spawnSite ||
                (colony.structures[STRUCTURE_SPAWN] || [undefined])[0] ||
                colony.room.controller;
            return this.createIdleTask(idleTarget.pos);
        }
        return this.createMoveTask(creep);
    }

    createIdleTask(idlePos) {
        const actionStack = [
            function (creep, idlePosition) {
                const IDLE_RANGE = 3;
                if (creep.pos.getRangeTo(idlePosition) > IDLE_RANGE) {
                    creep.betterMoveTo(idlePosition, {
                        maxRooms: 1,
                        range: IDLE_RANGE,
                        pathSet: pathSets.travel,
                    });
                }
                // If we see any creeps that aren't our, let's kill them
                return creep.room.find(FIND_CREEPS).find((c) => !c.my);
            },
        ];
        return new Task(idlePos, "idle", actionStack);
    }

    createMoveTask(creep) {
        const actionStack = [this.basicActions.moveToRoom];
        return new Task(
            {
                roomName: creep.memory.mission,
                maxRooms: 64,
                maxOps: 64000,
                pathSet: pathSets.travel,
            },
            "move",
            actionStack
        );
    }
}

module.exports = ColonizerDefenderManager;
