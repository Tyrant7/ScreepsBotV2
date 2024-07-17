const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { getScoutingData } = require("./scouting.scoutingUtility");

class ReserverManager extends CreepManager {
    /**
     * Generates a "reserve" task for this reserver.
     * @param {Creep} creep The creep to create tasks for.
     * @param {Colony} colony The colony object associated with the home room of the creep to generate tasks for.
     * @returns The best fitting task for this creep.
     */
    createTask(creep, colony) {
        // Assign this reserver to the highest priority remote currently without a reserver
        if (!creep.memory.targetRoom) {
            if (!colony.remotePlans) {
                return null;
            }

            // Find the first remote that doesn't have a reserver assigned to it
            // Find the highest priority remote that doesn't have a reserver assigned to it
            const activeRemotes = colony.remotePlans.filter((r) => {
                const active = r.active;
                const reserved =
                    this.activeTasks.length &&
                    Object.values(this.activeTasks).find(
                        (task) =>
                            task.data.roomName === r.room ||
                            (getScoutingData(r.room.name).controller &&
                                task.data.controllerID ===
                                    getScoutingData(r.room.name).controller.id)
                    );
                return active && !reserved;
            });
            if (activeRemotes.length) {
                const targetRemote = activeRemotes.reduce((best, curr) => {
                    return curr.score / curr.cost > best.score / best.cost
                        ? curr
                        : best;
                });
                creep.memory.targetRoom = targetRemote.room;
            }

            // If we still don't have a target room, just wait until a reserver dies
            if (!creep.memory.targetRoom) {
                return null;
            }
        }

        // If we're in the room, let's perpetually reserve until we die
        if (creep.room.name === creep.memory.targetRoom) {
            const controller = creep.room.controller;
            const actionStack = [];
            actionStack.push(function (creep, data) {
                const controller = Game.getObjectById(data.controllerID);
                if (creep.reserveController(controller) === ERR_NOT_IN_RANGE) {
                    creep.betterMoveTo(controller);
                }
            });
            return new Task(
                { controllerID: controller.id },
                "reserve",
                actionStack
            );
        }

        // If we're not in the room yet, let's get over there
        const actionStack = [this.basicActions.moveToRoom];
        return new Task(
            { roomName: creep.memory.targetRoom },
            "move",
            actionStack
        );
    }
}

module.exports = ReserverManager;
