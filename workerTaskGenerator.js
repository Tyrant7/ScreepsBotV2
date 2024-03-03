const Task = require("task");
const harvest = require("harvest");

class WorkerTaskGenerator {

    /**
     * Creates a list of appropriate worker tasks for this room and scores them by priority.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @param {Task[]} activeTasks List of current worker tasks to take into consideration when finding a new task.
     * @returns The best fitting task object for this creep.
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
                return this.createBasicTask(restock, taskType.restock);
            }
        }

        // Upgrade tasks -> ensure at least one at all times
        if (!roomInfo.upgraders.length && roomInfo.room.controller.my) {
            const existingTasks = activeTasks.filter((task) => task.target === roomInfo.room.controller.id && task.tag === taskType.upgrade);
            if (!existingTasks.length) {
                return this.createBasicTask(roomInfo.room.controller, taskType.upgrade);
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
                return this.createBasicTask(site, taskType.build);
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
                return this.createBasicTask(target, taskType.repair);
            }
        }

        // Let's create a default upgrade task in case we're out of other options
        return this.createBasicTask(roomInfo.room.controller, taskType.upgrade);
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

        const taskData = {};
        if (taskType === taskType.restock &&
            (target.structureType === STRUCTURE_SPAWN || target.structureType === STRUCTURE_EXTENSION)) {
            taskData.restockType = target.structureType;
        }
        else if (taskType === taskType.build) {
            taskData.buildType = target.structureType;
        }
        else {
            taskData.targetID = target.id;
        }

        return new Task(taskData, taskType, actionStack);
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
    [taskType.upgrade]: function(creep, data) {
        const target = Game.getObjectById(data.targetID);
        if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target.my;
    },
    [taskType.restock]: function(creep, data) {

        let target = null;
        // Restocking a particular ID takes precedence over a type of structure
        if (data.targetID) {
            target = Game.getObjectById(data.targetID);
            if (target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                return true;
            }
        }
        else {
            // Find closest structure matching the types to restock
            const restocks = creep.room.find(FIND_MY_STRUCTURES, { filter: 
                (s) => data.structureTypes.includes(s.structureType) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 
            });
            if (restocks.length === 0) {
                return true;
            }
            target = restocks.reduce(
                (closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, restocks[0]);
        }

        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0;
    },
    [taskType.build]: function(creep, data) {

        const home = Game.rooms[creep.memory.home];          
        const buildTargets = home.find(FIND_CONSTRUCTION_SITES, { filter: (site) => site.structureType === data.buildType })
        if (buildTargets.length === 0) {
            return true;
        }
        const target = buildTargets.reduce(
            (closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, buildTargets[0]);

        const intentResult = creep.build(target);
        if (intentResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0;
    },
    [taskType.repair]: function(creep, data) {
        const target = Game.getObjectById(data.targetID);
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target || target.hits === target.hitsMax;
    },
    "harvest": harvest,
};

module.exports = WorkerTaskGenerator;