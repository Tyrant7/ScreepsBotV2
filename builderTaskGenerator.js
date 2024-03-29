const Task = require("task");
const harvest = require("harvest");
const estimateTravelTime = require("estimateTravelTime");
const moveToRoom = require("moveToRoom");

class BuilderTaskGenerator {

    /**
     * Creates a build task.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @param {Task[]} activeTasks List of current builder tasks to take into consideration when finding a new task.
     * @returns The best fitting task object for this creep.
     */
    run(creep, roomInfo, activeTasks) {

        if (!creep.store[RESOURCE_ENERGY]) {
            return new Task({}, "harvest", [harvest]);
        }

        // Start by allocating to existing sites
        const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
        for (const site of sites) {

            // Don't allow more than one build task per site
            const existingTasks = activeTasks.filter((task) => task && task.data.targetID === site.id);
            if (existingTasks.length) {
                continue;
            }

            return this.createBuildTask(site);
        }

        // If no existing sites, we can start requesting more
        const constructionQueue = roomInfo.getConstructionQueue();
        if (constructionQueue.length) {
            // Get the highest priority site by build priority, then distance
            const priorities = getBuildPriority(creep);
            const bestSite = constructionQueue.reduce((best, curr) => {
                const bestPriority = ((priorities[best.type] || 1) * 1000) - estimateTravelTime(creep, best.pos);
                const currPriority = ((priorities[curr.type] || 1) * 1000) - estimateTravelTime(creep, curr.pos);
                return currPriority > bestPriority ? curr : best;
            });

            // Create a new site and instruct the creep to move to that room
            const realPos = new RoomPosition(bestSite.pos.x, bestSite.pos.y, bestSite.pos.roomName);
            realPos.createConstructionSite(bestSite.type);
            if (bestSite.pos.roomName !== creep.pos.roomName) {
                return new Task({ roomName: realPos.roomName }, "move", [moveToRoom]);
            }
            else {
                // Come back and search for the site we just created next tick
                return null;
            }
        }

        // Otherwise, no task -> let's wait 5 ticks and try again
        return new Task({ lastTick: Game.time }, "idle", [function(creep, data) { 
            creep.say("idle");
            if (Game.time >= data.lastTick + 5) {
                return true;
            }
        }]);
    }

    createBuildTask(site) {
        let actionStack = [function(creep, data) {
            const target = Game.getObjectById(data.targetID);
            if (!target) {
                return true;
            }
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    range: 2,
                });
            }
            return creep.store[RESOURCE_ENERGY] === 0;
        }];
        return new Task({ targetID: site.id }, "build", actionStack);
    }
}

function getBuildPriority(creep) {
    return creep.memory.remote
        ? remoteBuildPriorities
        : buildPriorities;
}

// Larger builders in our main room prioritize like this
const buildPriorities = {
    [STRUCTURE_STORAGE]: 10,
    [STRUCTURE_CONTAINER]: 9,
    [STRUCTURE_EXTENSION]: 8,
    [STRUCTURE_TOWER]: 7,
    [STRUCTURE_TERMINAL]: 6,
    [STRUCTURE_LINK]: 5,
    [STRUCTURE_LAB]: 4,
    [STRUCTURE_RAMPART]: 3,
    [STRUCTURE_ROAD]: 2,
    [STRUCTURE_WALL]: 1,
};

// Smaller remote builders prioritize like this
const remoteBuildPriorities = {
    [STRUCTURE_ROAD]: 10,
    [STRUCTURE_CONTAINER]: 9,
    [STRUCTURE_LINK]: 8,
    [STRUCTURE_RAMPART]: 7,
}

module.exports = BuilderTaskGenerator;