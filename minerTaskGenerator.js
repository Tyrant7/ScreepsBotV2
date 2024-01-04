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
                let container = tile.find((s) => s.structureType === STRUCTURE_CONTAINER);

                // No container -> try sites
                if (!container) {
                    container = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                }

                // We're standing on a container and can mine
                if (container) {
                    creep.harvest(target);
                }
                else {

                    // Otherwise, let's search around our source
                    const p = target.pos;
                    const containers = creep.room.lookForAtArea(LOOK_STRUCTURES, p.y-1, p.x-1, p.y+1, p.x+1, true).filter(
                        (s) => s.structure.structureType === STRUCTURE_CONTAINER);

                    // No containers near this source -> we should place one where we stand
                    if (containers.length === 0) {

                        // Verify that there are no other construction sites before placing one
                        const sites = creep.room.lookForAtArea(LOOK_CONSTRUCTION_SITES, p.y-1, p.x-1, p.y+1, p.x+1, true).filter(
                            (s) => s.constructionSite.structureType === STRUCTURE_CONTAINER);

                        if (sites.length === 0) {
                            creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
                        }
                        else {
                            if (creep.pos.getRangeTo(sites[0].constructionSite) > 0) {
                                creep.moveTo(sites[0].constructionSite);
                            }
                            else {
                                // We should harvest while waiting for our containers to not waste time
                                creep.harvest(target);
                            }
                        }
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