const { pathSets, roles, REMOTE_CONTAINER_RCL } = require("./constants");
const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { markWorkingPosition } = require("./extension.betterPathing");

class MinerManager extends CreepManager {
    createTask(creep, colony) {
        // Generate default miner behaviour -> miners only behave in one specific way
        const actionStack = [];
        actionStack.push(function (creep, miningSite) {
            // Extremely simple here

            // Move to mining site
            const source = Game.getObjectById(miningSite.sourceID);
            const sitePos = new RoomPosition(
                miningSite.pos.x,
                miningSite.pos.y,
                miningSite.pos.roomName
            );

            const isBlocked = (x, y) => {
                const blocker = creep.room.lookForAt(LOOK_CREEPS, x, y)[0];
                return (
                    blocker &&
                    (!blocker.my ||
                        (blocker !== creep &&
                            blocker.memory.role === roles.miner))
                );
            };

            // If site position is occupied, let's look for another, unoccupied spot near the source
            let movePos = sitePos;
            if (Game.rooms[sitePos.roomName] && isBlocked(sitePos)) {
                const findPosAdjacent = (pos) => {
                    const terrain = creep.room.getTerrain();
                    for (let x = pos.x - 1; x <= pos.x + 1; x++) {
                        for (let y = pos.y - 1; y <= pos.y + 1; y++) {
                            if (x < 1 || x > 48 || y < 1 || y > 48) {
                                continue;
                            }
                            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                                continue;
                            }
                            // Position is occupied as well
                            if (isBlocked(x, y)) {
                                continue;
                            }
                            return new RoomPosition(x, y, pos.roomName);
                        }
                    }
                };
                movePos = findPosAdjacent(source.pos);
            }
            if (!movePos) {
                creep.say("No spot");
                return false;
            }

            if (creep.pos.getRangeTo(movePos) > 0) {
                creep.betterMoveTo(movePos, {
                    range: 0,
                    pathSet: pathSets.default,
                });
            }

            // Repair/build our container
            if (
                source &&
                !source.energy &&
                creep.pos.getRangeTo(sitePos.x, sitePos.y) <= 3
            ) {
                // Repair our container
                if (creep.store[RESOURCE_ENERGY]) {
                    const container = sitePos
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_CONTAINER);
                    if (container && container.hits < container.hitsMax) {
                        creep.repair(container);
                    } else {
                        // We'll build our container if one doesn't exist yet and we're at the right level
                        const containerSite = sitePos
                            .lookFor(LOOK_CONSTRUCTION_SITES)
                            .find(
                                (s) => s.structureType === STRUCTURE_CONTAINER
                            );
                        if (containerSite) {
                            creep.build(containerSite);
                        } else if (
                            creep.room.name !== colony.room.name &&
                            colony.room.controller.level >= REMOTE_CONTAINER_RCL
                        ) {
                            sitePos.createConstructionSite(STRUCTURE_CONTAINER);
                        }
                    }
                }
                // Pickup some energy
                else {
                    const dropped = sitePos
                        .lookFor(LOOK_RESOURCES)
                        .find((r) => r.resourceType === RESOURCE_ENERGY);
                    if (dropped) {
                        creep.pickup(dropped);
                    } else {
                        const container = sitePos
                            .lookFor(LOOK_STRUCTURES)
                            .find(
                                (s) => s.structureType === STRUCTURE_CONTAINER
                            );
                        if (container && container.store[RESOURCE_ENERGY]) {
                            creep.withdraw(container, RESOURCE_ENERGY);
                        }
                    }
                }
            }
            // Mine our source
            else if (creep.pos.getRangeTo(source) <= 1) {
                creep.harvest(source);

                // We'll also mark this position to discourage creeps from walking through it
                markWorkingPosition(creep.pos);

                // We'll time how many ticks it took us to get here so we can replace this creep early
                if (!creep.memory.replaceTime) {
                    creep.memory.replaceTime =
                        Game.time - creep.memory.spawnTime;
                }
            }

            // Always return false since miners can never finish their task
            return false;
        });

        if (creep.memory.miningSite) {
            return new Task(creep.memory.miningSite, "mine", actionStack);
        }

        const unreserved = colony.getFirstOpenMiningSite(creep.pos);
        if (!unreserved) {
            creep.say("No site");
            return null;
        }

        creep.memory.replaceTime = 0;
        creep.memory.spawnTime = Game.time;

        // Mark this site as reserved
        creep.memory.miningSite = unreserved;
        return new Task(unreserved, "mine", actionStack);
    }
}

module.exports = MinerManager;
