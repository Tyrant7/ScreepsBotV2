const CreepManager = require("./creepManager");
const Task = require("./task");

class MinerManager extends CreepManager {
    createTask(creep, roomInfo) {

        // Generate default miner behaviour -> miners only behave in one specific way
        const actionStack = [];
        actionStack.push(function(creep, miningSite) {

            // Extremely simple here

            // Move to mining site
            const sitePos = new RoomPosition(miningSite.pos.x, miningSite.pos.y, miningSite.pos.roomName);
            if (creep.pos.getRangeTo(sitePos) > 0) {
                creep.moveTo(sitePos, {
                    range: 0,
                    pathSet: CONSTANTS.pathSets.remote,
                });
            }

            // Repair our container
            const source = Game.getObjectById(miningSite.sourceID);
            if (source && !source.energy && creep.pos.isEqualTo(sitePos)) {

                // Repair our container
                if (creep.store[RESOURCE_ENERGY]) {
                    const container = sitePos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                    if (container && container.hits < container.hitsMax) {
                        creep.repair(container);
                    }
                }
                // Pickup some energy
                else {
                    const dropped = sitePos.lookFor(LOOK_RESOURCES).find((r) => r.resourceType === RESOURCE_ENERGY);
                    if (dropped) {
                        creep.pickup(dropped);
                    }
                    else {
                        const container = sitePos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                        if (container && container.store[RESOURCE_ENERGY]) {
                            creep.withdraw(container, RESOURCE_ENERGY);
                        }
                    }
                }
            }
            // Mine our source
            else if (creep.pos.getRangeTo(source) <= 1) {
                creep.harvest(source);
            }

            // Always return false since miners can never finish their task
            return false;
        });

        if (creep.memory.miningSite) {
            return new Task(creep.memory.miningSite, "mine", actionStack);
        }

        const unreserved = roomInfo.getFirstUnreservedMiningSite();
        if (!unreserved) {
            // Wait for an opening
            // TODO //
            // Fix this so that early replacement can function
            return null;
        }

        // Mark this site as reserved
        creep.memory.miningSite = unreserved;
        return new Task(unreserved, "mine", actionStack);
    }
}

module.exports = MinerManager;