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

        // Start by allocating to existing sites
        const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
        for (const site of sites) {

            // Don't allow more build tasks than each 5,000 energy needed to complete
            const existingTasks = activeTasks.filter((task) => task && task.data.targetID === site.id);
            if (existingTasks.length >= Math.ceil((site.progressTotal - site.progress) / 5000)) {
                continue;
            }

            return this.createBuildTask(site);
        }

        // If no existing sites, we can start requesting more
        const constructionQueue = roomInfo.getConstructionQueue();
        if (constructionQueue.length) {
            // SGet then highest priority site by build priority, then distance
            const bestSite = constructionQueue.reduce((best, curr) => {
                const bestPriority = ((buildPriorities[best.type] || 1) * 1000) - estimateTravelTime(creep, best.pos);
                const currPriority = ((buildPriorities[curr.type] || 1) * 1000) - estimateTravelTime(creep, curr.pos);
                return currPriority > bestPriority ? curr : best;
            });

            // Create a new site and instruct the creep to move to that room
            const realPos = new RoomPosition(bestSite.pos.x, bestSite.pos.y, bestSite.pos.roomName);
            realPos.createConstructionSite(bestSite.type);
            
            // Otherwise we'll have to wait until next tick when the site is created to find it
            if (bestSite.pos.roomName !== creep.pos.roomName) {
                return new Task({ roomName: realPos.roomName }, "move", [moveToRoom]);
            }
        }
    }

    createBuildTask(site) {
        const actionStack = [harvest];
        actionStack.push(function(creep, data) {
            const target = Game.getObjectById(data.targetID);
            if (!target) {
                return true;
            }
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    reusePath: 30,
                    range: 2,
                });
            }
            return creep.store[RESOURCE_ENERGY] === 0;
        });

        return new Task({ targetID: site.id }, "build", actionStack);
    }
}

const buildPriorities = {
    [STRUCTURE_STORAGE]: 9,
    [STRUCTURE_CONTAINER]: 8,
    [STRUCTURE_TOWER]: 7,
    [STRUCTURE_LINK]: 6,
    [STRUCTURE_EXTENSION]: 5,
    [STRUCTURE_RAMPART]: 4,
    [STRUCTURE_ROAD]: 3,
    [STRUCTURE_WALL]: 2,
};

module.exports = BuilderTaskGenerator;