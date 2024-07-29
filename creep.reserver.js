const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { getScoutingData } = require("./scouting.scoutingUtility");
const { pathSets } = require("./constants");

class ReserverManager extends CreepManager {
    /**
     * Generates a "reserve" task for this reserver.
     * @param {Creep} creep The creep to create tasks for.
     * @param {Colony} colony The colony object associated with the home room of the creep to generate tasks for.
     * @returns The best fitting task for this creep.
     */
    createTask(creep, colony) {
        const actionStack = [
            function (creep, targetID) {
                const controller = Game.getObjectById(targetID);
                if (creep.pos.getRangeTo(controller) <= 1) {
                    if (
                        controller.reservation &&
                        controller.reservation.username !== ME
                    ) {
                        creep.attackController(controller);
                        return false;
                    }
                    creep.reserveController(controller);
                    return false;
                }
                creep.betterMoveTo(controller, { pathSet: pathSets.travel });
            },
        ];

        // Search for the first invader core that isn't taken yet
        let target = creep.memory.target;
        if (!target) {
            let firstUnreservedControllerID;
            let controllerRoom;
            for (const plan of colony.remotePlans) {
                if (!plan.active) continue;
                const roomData = getScoutingData(plan.room);
                if (!roomData) continue;
                if (!roomData.controller) continue;
                if (
                    colony.reservers.find(
                        (r) =>
                            r.memory.target &&
                            r.memory.target.id === roomData.controller.id
                    )
                )
                    continue;
                firstUnreservedControllerID = roomData.controller.id;
                controllerRoom = plan.room;
                break;
            }
            if (!firstUnreservedControllerID) {
                creep.say("No Cont");
                return;
            }
            target = {
                id: firstUnreservedControllerID,
                roomName: controllerRoom,
            };
        }
        creep.memory.target = target;

        // Move to room if not there yet to not risk having no vision
        if (creep.room.name !== target.roomName) {
            return new Task(target, "move", [this.basicActions.moveToRoom]);
        }
        return new Task(target.id, "reserve", actionStack);
    }
}

module.exports = ReserverManager;
