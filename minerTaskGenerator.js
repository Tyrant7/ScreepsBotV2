const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class MinerTaskGenerator {

    run(roomInfo, taskHandler) {
        // Nothing to do here; miners do not need special tasks
    }

    generateDefaultTask(creep) {

        // Generate default miner behaviour
        const actionStack = [];
        actionStack.push(function(creep, target) {

            // Once we get close enough to mine, start checking for containers to stand on
            if (creep.pos.getRangeTo(target) <= 1) {

                // Look for a container on our tile first
                const tile = creep.pos.lookFor(LOOK_STRUCTURES);
                const container = tile.find((item) => item.structureType === STRUCTURE_CONTAINER);

                // We're standing on a container and can mine
                if (container) {
                    creep.harvest(target);
                }
                else {

                    // Otherwise, let's search around our source
                    const p = target.pos;

                    // TODO // Change out for lookForAtArea to avoid the extra filter condition
                    const containers = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).filter(
                        (item) => item.type === LOOK_STRUCTURES && item.structure.structureType === STRUCTURE_CONTAINER);

                    // No containers near this source -> we should place one where we stand
                    if (containers.length === 0) {
                        creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);

                        // We should harvest while waiting for our containers to not waste time
                        creep.harvest(target);
                    }
                    // Container found -> move to it before mining
                    else {
                        creep.moveTo(containers[0].structure);
                    }
                }
            }
            else {
                creep.moveTo(target);
            }

            // Always return false since miners can never finish their task
            return false;
        });

        const task = new Task(creep.memory.sourceID, "mine", actionStack);
        return new TaskPoolEntry(task, 0);
    }
}

module.exports = MinerTaskGenerator;