const Task = require("task");
const harvest = require("harvest");

class WorkerTaskGenerator {

    /**
     * Creates a list of appropriate worker tasks for this room and scores them by priority.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @param {Task[]} activeTasks List of current worker tasks to take into consideration when finding a new task.
     * @returns {Task[]} An array of tasks.
     */
    run(creep, roomInfo, activeTasks) {

        // Create some restock tasks if we don't have haulers or miners yet
        // Yes, duplicated code, I know :/
        if (!roomInfo.miners.length || !roomInfo.haulers.length) {
            const restockables = roomInfo.room.find(FIND_MY_STRUCTURES, { filter: (s) => s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
            for (const restock of restockables) {
    
                // These will be handled by haulers and miners
                if (restock.structureType === STRUCTURE_CONTAINER ||
                    restock.structureType === STRUCTURE_STORAGE) {
                    continue;
                }
    
                // No more than one restock task per object
                const existingTasks = activeTasks.filter((task) => task.target === restock.id && task.tag === taskType.restock);
                if (existingTasks.length) {
                    continue;
                }
    
                // All that's left should be towers, spawn, and extensions
                return [this.createBasicTask(restock, taskType.restock)];
            }
        }

        // Upgrade tasks -> ensure at least one at all times
        if (!roomInfo.upgraders.length && roomInfo.room.controller.my) {
            const existingTasks = activeTasks.filter((task) => task.target === roomInfo.room.controller.id && task.tag === taskType.upgrade);
            if (!existingTasks.length) {
                return [this.createBasicTask(roomInfo.room.controller, taskType.upgrade)];
            }
        }

        // Construction tasks
        const sites = roomInfo.room.find(FIND_MY_CONSTRUCTION_SITES);
        if (sites.length) {

            // Sort sites by priority
            sites.sort((a, b) => {
                return (buildPriorities[a.structureType] || 1) - (buildPriorities[b.structureType] || 1);
            });

            for (const site of sites) {
                
                // Don't allow more build tasks than each 5,000 energy needed to complete
                const existingTasks = activeTasks.filter((task) => task.target === site.id);
                if (existingTasks.length >= Math.ceil((site.progressTotal - site.progress) / 5000)) {
                    continue;
                }

                // Create a basic worker task for building
                return [this.createBasicTask(site, taskType.build)];
            }
        }

        // Repair tasks
        const repairables = roomInfo.room.find(FIND_STRUCTURES, { filter: (s) => s.hits < s.hitsMax });
        if (repairables.length) {

            // Sort repairables by repair need
            repairables.sort((a, b) => {

                // Calculate which needs more repair by a simple fraction of their max, 
                // factoring in a multiplier for certain structures like walls
                const aRepairNeed = 1 - (a.hits / (a.hitsMax * (repairThresholds[a.structureType] || 1)));
                const bRepairNeed = 1 - (b.hits / (b.hitsMax * (repairThresholds[b.structureType] || 1)));
                return aRepairNeed - bRepairNeed;
            });

            for (const target of repairables) {
            
                if (repairThresholds[target.structureType] &&
                    target.hits / target.hitsMax >= repairThresholds[target.structureType]) {
                    continue;
                }
    
                // One repair task per target
                const existingTasks = activeTasks.filter((task) => task.target === target.id && task.tag === taskType.repair);
                if (existingTasks.length) {
                    continue;
                }
    
                // Create a basic worker task for repairing
                return [this.createBasicTask(target, taskType.repair)];
            }
        }

        // Let's create a default upgrade task in case we're out of other options
        return [this.createBasicTask(roomInfo.room.controller, taskType.upgrade)];
    }

    /**
     * Creates a basic worker task that consists of a harvest step, and an action step. 
     * @param {*} target The target of the action step of the task.
     * @param {number} taskType One of the taskType constants to use as a tag for the created task.
     * @returns {Task} A new task object with the appropriate actions, target, and tag.
     */
    createBasicTask(target, taskType) {

        // Initialize our action stack with a default harvest, plus an action matching the task type
        const actionStack = [];
        actionStack.push(basicWorkerActions["harvest"]);
        actionStack.push(basicWorkerActions[taskType]);

        return new Task(target.id, taskType, actionStack);
    }
}

// Don't repair these structures too much
const repairThresholds = {
    [STRUCTURE_WALL]: 0.002,
    [STRUCTURE_RAMPART]: 0.005,
    [STRUCTURE_CONTAINER]: 0.5,
    [STRUCTURE_ROAD]: 0.65
};

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

const taskType = {
    upgrade: "upgrade",
    restock: "restock",
    build: "build",
    repair: "repair",
};

const basicWorkerActions = {
    [taskType.upgrade]: function(creep, target) {
        if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target.my;
    },
    [taskType.restock]: function(creep, target) {

        // Our target got destroyed for some reason, so comparisons against its type will no longer work
        // -> let's get a new task
        if (!target) {
            return true;
        }

        // Since refilling any extension or spawn is essentially the same, just find the closest one
        // If it's a tower then we must refill the appropriate one
        let restock = target;
        if (target instanceof StructureExtension || target instanceof StructureSpawn) {
            const extensions = creep.room.find(FIND_MY_STRUCTURES, { filter: 
                (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) 
                && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });

            // Find closest extension or spawn
            restock = extensions ?
                extensions.reduce((closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, target) :
                target;
        }

        if (creep.transfer(restock, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(restock);
        }
        return restock.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || creep.store[RESOURCE_ENERGY] === 0;
    },
    [taskType.build]: function(creep, target) {

        // Our target has been built so we won't be able to make proper comparison to it
        // We can request a new task, and if there are any build tasks remaining it's likely
        // that we'll receive one for the structureType we were trying to build anyway
        if (!target) {
            return true;
        }

        // Find the closest site in the creep's homeroom matching its target sturctureType
        // Do this so that all roads or extensions will be built in order of distance instead of all at once
        const home = Game.rooms[creep.memory.home];
        const buildTarget = home.find(FIND_CONSTRUCTION_SITES, { 
            filter: (site) => site.structureType === target.structureType })
            .reduce((closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, target);
        if (!buildTarget) {
            return true;
        }

        const intentResult = creep.build(buildTarget);
        if (intentResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(buildTarget);
        }
        // INVALID_TARGET means that the target is now built and no longer a construction site
        return creep.store[RESOURCE_ENERGY] === 0 || intentResult === ERR_INVALID_TARGET;
    },
    [taskType.repair]: function(creep, target) {
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target || target.hits === target.hitsMax;
    },
    "harvest": harvest,
};

module.exports = WorkerTaskGenerator;