const Task = require("task");

class MinerTaskGenerator {

    run(roomInfo, activeTasks) {

        // Generate default miner behaviour -> miners only behave in one specific way
        const actionStack = [];
        actionStack.push(function(creep, target) {

            // Our actual target won't be valid, let's get our assigned source
            const harvestTarget = Game.getObjectById(creep.memory.sourceID);
            if (!harvestTarget) {
                return;
            }

            // Once we get close enough to mine, start checking for containers to stand on
            if (creep.pos.getRangeTo(harvestTarget) <= 1) {

                // Look for a container on our tile first
                const tile = creep.pos.lookFor(LOOK_STRUCTURES);
                let container = tile.find((s) => s.structureType === STRUCTURE_CONTAINER);

                // No container -> try sites
                if (!container) {
                    container = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                }

                // We're standing on a container and can mine
                if (container) {
                    creep.harvest(harvestTarget);
                }
                else {

                    // Otherwise, let's search around our source
                    const p = harvestTarget.pos;
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
                                creep.harvest(harvestTarget);
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
                creep.moveTo(harvestTarget);
            }

            // Always return false since miners can never finish their task
            return false;
        });

        // Since this task isn't associated with any particular object, we don't have to give it a target
        return [new Task(null, "mine", actionStack)];
    }
}

module.exports = MinerTaskGenerator;