const Task = require("task");
const harvest = require("harvest");
const moveToRoom = require("moveToRoom");

class RemoteBuilderTaskGenerator {

    /**
     * Creates either a "move" or "build" task depending on this remote builder's room.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the home room of the creep to generate tasks for.
     * @param {Task[]} activeTasks List of current remote builder tasks to take into consideration when finding a new task.
     * @returns {Task[]} An array of a single task object.
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

                // If there are no other builders already building this one, let's go for it
                if (!activeTasks.find((task) => !task || task.target === site.id)) {
                    return this.makeBuildTask(site);
                }
            }

            // Otherwise, nothing left to build 
            // -> let's wait to be reassigned or for more targets to be created
            return null;
        }

        // We're not in the room yet, let's get over there
        const actionStack = [];
        actionStack.push(function(creep, target) {
            // Wait to get reassigned
            if (!target) {
                return true;
            }
            moveToRoom(creep, target);
        });
        return [new Task(creep.memory.targetRoom, "move", actionStack)];
    }

    makeBuildTask(site) {

        const actionStack = [];
        actionStack.push(harvest);
        actionStack.push(function(creep, target) {

            // We should have a target, if not just request a new build task
            if (!target) {
                return true;
            }

            // It's a remote, there won't be anything too expensive to build in it
            // Just pick whatever's closest
            const buildTarget = creep.room.find(FIND_MY_CONSTRUCTION_SITES)
                .reduce((closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, target);
            if (!buildTarget) {
                return true;
            }

            const intentResult = creep.build(buildTarget);
            if (intentResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(buildTarget);
            }
            return creep.store[RESOURCE_ENERGY] === 0;
        });

        return [new Task(site.id, "build", actionStack)];
    }
}

module.exports = RemoteBuilderTaskGenerator;