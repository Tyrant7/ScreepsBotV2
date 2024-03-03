const Task = require("task");
const harvest = require("harvest");
const moveToRoom = require("moveToRoom");
const remoteBuildUtility = require("remoteBuildUtility");

class RemoteBuilderTaskGenerator {

    /**
     * Creates either a "move" or "build" task depending on this remote builder's room.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current remote builder tasks to take into consideration when finding a new task.
     * @returns The best fitting task for this creep.
     */
    run(creep, roomInfo, activeTasks) {

        // Wait for a target before
        if (!creep.memory.targetRoom) {
            creep.say("No room!");
            return null;
        }

        if (creep.room.name === creep.memory.targetRoom) {
            const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
            for (const site of sites) {

                // Don't build sites that weren't planned
                if (!remoteBuildUtility.isStructurePlanned(roomInfo.room.name, site.pos, site.structureType)) {
                    continue;
                }
                return this.makeBuildTask();
            }

            // Otherwise, nothing left to build 
            // -> Let's look for repair targets instead
            const repairTargets = creep.room.find(FIND_STRUCTURES, { filter: (s) => {
                return s.hits < s.hitsMax;
            }});
            if (repairTargets.length) {
                const bestTarget = repairTargets.reduce((best, curr) => {

                    // Don't allow us to repair structures that weren't planned
                    if (!remoteBuildUtility.isStructurePlanned(roomInfo.room.name, curr.pos, curr.structureType)) {
                        return best;
                    }

                    return curr.hits < best.hits ? curr : best;
                });
                return this.makeRepairTask(bestTarget);
            }

            // Nothing to do
            // -> let's wait to be reassigned or for more tasks to be created
            return null;
        }

        // We're not in the room yet, let's get over there
        const actionStack = [];
        actionStack.push(moveToRoom);
        return new Task({ roomName: creep.memory.targetRoom }, "move", actionStack);
    }

    makeBuildTask(site) {

        const actionStack = [];
        actionStack.push(harvest);
        actionStack.push(function(creep, data) {

            // It's a remote, so there won't be anything too expensive to build in it
            // Just pick whatever's closest
            const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES).filter((site) => {
                return remoteBuildUtility.isStructurePlanned(creep.memory.home, site.pos, site.structureType);
            });
            if (!sites.length) {
                return true;
            }
            const buildTarget = sites.reduce((closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, sites[0]);
            if (creep.build(buildTarget) === ERR_NOT_IN_RANGE) {
                creep.moveTo(buildTarget);
            }
            return creep.store[RESOURCE_ENERGY] === 0;
        });

        // No data necessary for this task
        return new Task(null, "build", actionStack);
    }

    makeRepairTask(structure) {

        const actionStack = [];
        actionStack.push(harvest);
        actionStack.push(function(creep, data) {
            const target = Game.getObjectById(data.repairID);
            if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }
            return creep.store[RESOURCE_ENERGY] === 0 || !target || target.hits === target.hitsMax;
        });

        return new Task({ repairID: structure.id }, "repair", actionStack);
    }
}

module.exports = RemoteBuilderTaskGenerator;