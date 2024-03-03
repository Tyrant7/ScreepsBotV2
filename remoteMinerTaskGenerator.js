const Task = require("task");
const moveToRoom = require("moveToRoom");

class RemoteMinerTaskGenerator {

    /**
     * Generates a "harvest" task for this miner.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current miner tasks to take into consideration when finding a new task.
     * @returns The best fitting task for this creep.
     */
    run(creep, roomInfo, activeTasks) {

        // Wait for a target before
        if (!creep.memory.targetRoom || !creep.memory.sourceID) {
            return null;
        }

        // If we're in the room, let's perpetually mine until we die
        if (Game.rooms[creep.memory.targetRoom]) {
            const actionStack = [];
            actionStack.push(function(creep, data) {

                const source = Game.getObjectById(data.sourceID);
                if (creep.pos.getRangeTo(source) <= 1) {

                    // Look for a container on our tile before mining
                    const tile = creep.pos.lookFor(LOOK_STRUCTURES);
                    const container = tile.find((s) => s.structureType === STRUCTURE_CONTAINER);

                    if (!container) {

                        // No container, let's look around us for one
                        const p = source.pos;
                        const containers = creep.room.lookForAtArea(LOOK_STRUCTURES, p.y-1, p.x-1, p.y+1, p.x+1, true).filter(
                            (s) => s.structure.structureType === STRUCTURE_CONTAINER);

                        if (containers.length > 0) {
                            creep.moveTo(containers[0]);
                        }
                    }

                    // Mine!
                    creep.harvest(source);
                }
                else {
                    creep.moveTo(source);
                }
            });
            return new Task({ sourceID: creep.memory.sourceID }, "mine", actionStack);
        }

        // If we're not in the room yet, let's get over there
        const actionStack = [moveToRoom];
        return new Task({ roomName: creep.memory.targetRoom }, "move", actionStack);
    }
}

module.exports = RemoteMinerTaskGenerator;