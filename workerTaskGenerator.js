const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class WorkerTaskGenerator {

    run(roomInfo, taskHandler) {

        // Generate tasks to do with workers
        const tasks = [];

        // Start with construction tasks
        const sites = roomInfo.room.find(FIND_MY_CONSTRUCTION_SITES);
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
        const repairable = roomInfo.room.find(FIND_MY_STRUCTURES, { filter: (s) => s.hits < s.hitsMax });
        for (const target of repairable) {
            
            // Don't repair these structures too much
            const repairThresholds = {
                [STRUCTURE_WALL]: 0.05,
                [STRUCTURE_RAMPART]: 0.075,
                [STRUCTURE_CONTAINER]: 0.5,
                [STRUCTURE_ROAD]: 0.65
            };
            if (repairThresholds[target.structureType] &&
                target.hits / target.hitsMax >= repairThresholds[target.structureType]) {
                continue;
            }

            // One repair task per target for each 150k health missing, max one for walls and ramparts
            const existingTasks = taskHandler.getTasksForObjectByTag(target.id, taskType.repair);
            if (existingTasks.length &&
               (target.structureType === STRUCTURE_WALL ||
                target.structureType === STRUCTURE_RAMPART)) {
                continue;
            }
            else if (existingTasks.length >= Math.ceil((target.hitsMax - target.hits) / 150000)) {
                continue;
            }

            // Create a basic worker task for repairing
            tasks.push(this.createBasicTask(target.id, taskType.repair));
        }

        // Restock tasks
        const restockables = roomInfo.room.find(FIND_MY_STRUCTURES, { filter: (s) => s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        for (const restock of restockables) {

            // These will be handled by haulers and miners
            if (restock.structureType === STRUCTURE_CONTAINER ||
                restock.structureType === STRUCTURE_STORAGE) {
                continue;
            }

            // No more than one restock task per object, except before any extensions are built
            const existingTasks = taskHandler.getTasksForObjectByTag(restock.id, taskType.restock);
            if (existingTasks.length && (roomInfo.room.energyCapacityAvailable > 500 || existingTasks.length >= 3)) {
                continue;
            }

            // All that's left should be towers, spawn, and extensions
            // Create a basic worker task for restocking
            tasks.push(this.createBasicTask(restock.id, taskType.restock));
        }

        // Upgrade tasks -> ensure at least one at all times
        if (roomInfo.room.controller.my) {
            const existingTasks = taskHandler.getTasksForObjectByTag(roomInfo.room.controller.id, taskType.upgrade);
            if (!existingTasks.length) {
    
                // Create a basic worker task for upgrading
                tasks.push(this.createBasicTask(roomInfo.room.controller.id, taskType.upgrade));
            }
        }

        return tasks;
    }

    /**
     * Generates a default task for workers in this room.
     * @param {Creep} creep The creep to generate the task for.
     * @returns A newly created 'upgrade' task.
     */
    generateDefaultTask(creep) {
        // Default the priority to zero in case this worker dies and the task is returned to the pool
        const entry = this.createBasicTask(creep.room.controller.id, taskType.upgrade);
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
};

const basicWorkerActions = {
    [taskType.upgrade]: function(creep, target) {
        if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target.my;
    },
    [taskType.restock]: function(creep, target) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }      
        return target.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || creep.store[RESOURCE_ENERGY] === 0;
    },
    [taskType.build]: function(creep, target) {
        if (creep.build(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target;
    },
    [taskType.repair]: function(creep, target) {
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target;
    },
    "harvest": function(creep, target) {

        // Gets energy from the room's storage, or nearest container if one is available
        let harvest = Game.getObjectById(creep.memory.harvestTarget);

        // Determine our closest target and cache it while it's valid
        const energy = !harvest ? 0 : harvest instanceof Source ? harvest.energy : 
                                      harvest instanceof Resource ? harvest.amount : 
                                      harvest.store[RESOURCE_ENERGY];
        if (energy === 0) {
            // Containers
            let sources = creep.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0 });

            // Add dropped resources that are on containers or container sites to account for miners who don't have their containers built yet and overflows
            sources.push(...creep.room.find(FIND_DROPPED_RESOURCES, { 
                filter: (r) => r.resourceType === RESOURCE_ENERGY 
                && (r.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER)
                || r.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER)) }));

            // Storage
            if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
                sources.push(creep.room.storage);
            }

            // We don't have any containers or storage yet, mine our own energy
            if (!sources || !sources.length) {
                sources = creep.room.find(FIND_SOURCES, { filter: (s) => s.energy > 0 });
            }

            const closest = sources.reduce((closest, curr) => creep.pos.getRangeTo(closest) <= creep.pos.getRangeTo(curr) ? closest : curr);
            creep.memory.harvestTarget = closest.id;
            harvest = Game.getObjectById(creep.memory.harvestTarget);
        }

        // Determine if it's worth gathering ->
        // If we're above a baseline energy threshold and are closer to our target than our refill, 
        // skip refilling and go directly to our target instead
        const optionalRefillThreshold = 50;
        if (creep.store[RESOURCE_ENERGY] >= optionalRefillThreshold &&
            creep.pos.getRangeTo(target) <= creep.pos.getRangeTo(harvest)) {
            return true;
        }

        // Determine what type of intent to use to gather this energy
        let intentResult;
        if (harvest instanceof Source) {
            intentResult = creep.harvest(harvest);
        }
        else if (harvest instanceof Resource) {
            intentResult = creep.pickup(harvest);
        }
        else {
            intentResult = creep.withdraw(harvest, RESOURCE_ENERGY);
        }

        // Pick it up
        if (intentResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(harvest);
        }

        // We're done when we can't hold anymore energy
        const full = creep.store.getFreeCapacity() === 0;
        if (full) {
            // Revoke our current harvest target after completing the task
            delete creep.memory.harvestTarget;
        }
        return full;
    }
};

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