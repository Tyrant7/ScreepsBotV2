const CreepManager = require("./creepManager");
const Task = require("./task");
const estimateTravelTime = require("./estimateTravelTime");

class BuilderManager extends CreepManager {

    /**
     * Creates a build task.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @returns The best fitting task object for this creep.
     */
    createTask(creep, roomInfo) {

        if (!creep.store[RESOURCE_ENERGY]) {
            return new Task({}, "harvest", [this.basicActions.seekEnergy]);
        }

        // Start by allocating to existing sites
        const priorities = getBuildPriority(creep);
        const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
        if (sites.length) {
            const bestSite = sites.reduce((best, curr) => {
                const bestPriority = ((priorities[best.structureType] || 1) * 1000) - creep.pos.getRangeTo(best.pos);
                const currPriority = ((priorities[curr.structureType] || 1) * 1000) - creep.pos.getRangeTo(curr.pos);
                return currPriority > bestPriority ? curr : best;
            });
            return this.createBuildTask(bestSite);
        }

        // If no existing sites, we can start requesting more
        const constructionQueue = roomInfo.getConstructionQueue();
        if (constructionQueue.length) {
            // Get the highest priority site by build priority, then distance
            const bestSite = constructionQueue.reduce((best, curr) => {
                const bestPriority = ((priorities[best.type] || 1) * 1000) - estimateTravelTime(creep.pos, best.pos);
                const currPriority = ((priorities[curr.type] || 1) * 1000) - estimateTravelTime(creep.pos, curr.pos);
                return currPriority > bestPriority ? curr : best;
            });

            // Create a new site and instruct the creep to move to that room
            const realPos = new RoomPosition(bestSite.pos.x, bestSite.pos.y, bestSite.pos.roomName);
            const existingSite = realPos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
            if (existingSite) {

                // If there's already a site here, go build it
                return this.createBuildTask(existingSite);
            }
            
            realPos.createConstructionSite(bestSite.type);
            if (bestSite.pos.roomName !== creep.pos.roomName) {
                return new Task({ roomName: realPos.roomName }, "move", [this.basicActions.moveToRoom]);
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
        const actionStack = [function(creep, data) {
            const target = Game.getObjectById(data.targetID);
            if (!target) {
                return true;
            }
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    range: 2,
                    pathSet: CONSTANTS.pathSets.default,
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
    [STRUCTURE_SPAWN]: 11,
    [STRUCTURE_STORAGE]: 10,
    [STRUCTURE_EXTENSION]: 9,
    [STRUCTURE_CONTAINER]: 8,
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
    [STRUCTURE_SPAWN]: 11,
    [STRUCTURE_ROAD]: 10,
    [STRUCTURE_CONTAINER]: 9,
    [STRUCTURE_LINK]: 8,
    [STRUCTURE_RAMPART]: 7,
}

module.exports = BuilderManager;