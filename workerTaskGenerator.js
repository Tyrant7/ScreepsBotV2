const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

console.log("jjjj");

class WorkerTaskGenerator {

    run(roomInfo, taskHandler) {

        // Generate tasks to do with workers
        const tasks = [];

        // Start with construction tasks
        const sites = roomInfo.find(FIND_MY_CONSTRUCTION_SITES);
        for (const site of sites) {

            // Don't allow more build tasks than each 5000 energy needed to complete
            const existingTasks = taskHandler.getTasksForObject(site.id);
            if (existingTasks.length >= Math.ceil((site.progressTotal - site.progress) / 5000)) {
                continue;
            }

            // Create a basic worker task for building
            tasks.push(this.createBasicTask(site.id, taskType.build));
        }

        // Repair tasks
        const repairable = roomInfo.find(FIND_MY_STRUCTURES, { filter: (s) => s.hits < s.hitsMax });
        for (const target of repairable) {
            
            // Don't repair these structures too much
            const repairThresholds = {
                [STRUCTURE_WALL]: 0.05,
                [STRUCTURE_RAMPART]: 0.075,
                [STRUCTURE_CONTAINER]: 0.5
            }
            if (repairThresholds[target.structureType] &&
                target.hits / target.hitsMax >= repairThresholds[target.structureType]) {
                continue;
            }

            // One repair task per target for each 150k health missing, max one for walls and ramparts
            const existingTasks = taskHandler.getTasksForObject(target.id, taskType.repair);
            if (existingTasks.length &&
               (target.structureType === STRUCTURE_WALL ||
                target.structureType === STRUCTURE_RAMPART)) {
                continue;
            }
            else if (existingTasks.length >= Math.ceil((target.hitsMax - target.hits) / 150_000)) {
                continue;
            }

            // Create a basic worker task for repairing
            tasks.push(this.createBasicTask(target.id, taskType.repair));
        }

        // Restock tasks
        const restockables = roomInfo.find(FIND_MY_STRUCTURES, { filter: (s) => s.store && s.store.getFreeCapacity > 0 });
        for (const restock of restockables) {

            // These will be handled by haulers and miners
            if (restock.structureType === STRUCTURE_CONTAINER ||
                restock.structureType === STRUCTURE_STORAGE) {
                continue;
            }

            // No more than one restock task per object, except before any extensions are built
            const existingTasks = taskHandler.getTasksForObject(target.id, taskType.restock);
            if (existingTasks.length && (roomInfo.energyCapacityAvailable > 500 || existingTasks.length >= 3)) {
                continue;
            }

            // All that's left should be towers, spawn, and extensions
            // Create a basic worker task for restocking
            tasks.push(this.createBasicTask(restock.id, taskType.restock));
        }

        // Upgrade tasks -> ensure at least one for now
        const existingTasks = taskHandler.getTasksForObject(roomInfo.controller, taskType.upgrade);
        if (!existingTasks.length) {

            // Create a basic worker task for upgrading
            tasks.push(this.createBasicTask(roomInfo.controller.id, taskType.upgrade));
        }

        return tasks;
    }

    /**
     * Generates a default task for workers in this room.
     * @param {RoomInfo} roomInfo The RoomInfo object for this room.
     * @returns A newly created 'upgrade' task.
     */
    generateDefaultTask(roomInfo) {
        // Default the priority to zero in case this worker dies and the task is returned to the pool
        const entry = this.createBasicTask(roomInfo.controller.id, taskType.upgrade);
        entry.priority = 0;
        return entry;
    }

    /**
     * Creates a basic worker task that consists of a harvest step, and an action step. 
     * @param {string} targetID The target of the action step of the task.
     * @param {number} taskType One of the taskType constants to use as a tag for the created task.
     * @returns {TaskPoolEntry} A new taskPoolEntry object with an assigned priority and task.
     */
    createBasicTask(targetID, taskType) {

        // Initialize our action stack with a default harvest, plus an action matching the task type
        const actionStack = [];
        actionStack.push(basicWorkerActions["harvest"]);
        actionStack.push(basicWorkerActions[taskType]);

        const task = new Task(targetID, taskType, actionStack);
        const priority = 0; // TODO //

        return new TaskPoolEntry(task, priority);
    }
}

const taskType = {
    upgrade: "upgrade",
    restock: "restock",
    build: "build",
    repair: "repair"
}

const basicWorkerActions = {
    [taskType.upgrade]: function(creep, target) {
        if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return !creep.store[RESOURCE_ENERGY];
    },
    [taskType.restock]: function(creep, target) {
        if (creep.transfer(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return !creep.store[RESOURCE_ENERGY];
    },
    [taskType.build]: function(creep, target) {
        if (creep.build(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return !creep.store[RESOURCE_ENERGY];
    },
    [taskType.repair]: function(creep, target) {
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return !creep.store[RESOURCE_ENERGY];
    },
    "harvest": function(creep, target) {

        // Gets energy from the room's storage, or nearest container if one is available
        const harvest = creep.memory.harvestTarget;

        // Determine our closest target and cache it while it's valid
        if (!harvest || harvest.store[RESOURCES_ENERGY] === 0) {
            const sources = creep.room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0 });
            if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
                sources.push(creep.room.storage);
            }
            const closest = sources.reduce((closest, curr) => creep.pos.getRangeTo(closest) <= creep.pos.getRangeTo(curr) ? closest : curr);
            creep.memory.harvestTarget = closest.id;
        }

        // Harvest from it
        if (creep.withdraw(harvest) === ERR_NOT_IN_RANGE) {
            creep.moveTo(harvest);
        }

        return creep.getFreeCapacity() === 0;
    }
}

/*
const priorityMap = {
    [taskType.upgrade]: function(target, roomInfo) {
        
    },
    [taskType.restock]: function(target, roomInfo) {

    },
    [taskType.build]: function(target, roomInfo) {

    },
    [taskType.repair]: function(target, roomInfo) {

    }
}
*/

module.exports = WorkerTaskGenerator;