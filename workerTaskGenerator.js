const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class WorkerTaskGenerator {

    /**
     * Creates a list of appropriate worker tasks for this room.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @param {TaskHandler} taskHandler The handler object associated with the room to read existing tasks out of.
     * @returns {TaskPoolEntry[]} An array of TaskPoolEntry objects with assigned priorities and tasks.
     */
    run(roomInfo, taskHandler) {

        // Generate tasks to do with workers
        const tasks = [];

        // Start with construction tasks
        const sites = roomInfo.room.find(FIND_MY_CONSTRUCTION_SITES);
        for (const site of sites) {

            // Don't allow more build tasks than each 10,000 energy needed to complete
            const existingTasks = taskHandler.getTasksForObject(site.id);
            if (existingTasks.length >= Math.ceil((site.progressTotal - site.progress) / 10000)) {
                continue;
            }

            // Create a basic worker task for building
            tasks.push(this.createBasicTask(site, taskType.build));
        }

        // Repair tasks
        const repairable = roomInfo.room.find(FIND_STRUCTURES, { filter: (s) => s.hits < s.hitsMax });
        for (const target of repairable) {
            
            if (repairThresholds[target.structureType] &&
                target.hits / target.hitsMax >= repairThresholds[target.structureType]) {
                continue;
            }

            // One repair task per target for each 150k health missing, max one for walls and ramparts
            const existingTasks = taskHandler.getTasksForObjectByTag(target.id, taskType.repair);
            if ((target.structureType === STRUCTURE_WALL ||
                target.structureType === STRUCTURE_RAMPART) &&
                existingTasks.length) {
                continue;
            }
            else if (existingTasks.length >= Math.ceil((target.hitsMax - target.hits) / 150000)) {
                continue;
            }

            // Create a basic worker task for repairing
            tasks.push(this.createBasicTask(target, taskType.repair));
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
            tasks.push(this.createBasicTask(restock, taskType.restock));
        }

        // Upgrade tasks -> ensure at least one at all times
        if (roomInfo.room.controller.my) {
            const existingTasks = taskHandler.getTasksForObjectByTag(roomInfo.room.controller.id, taskType.upgrade);
            if (!existingTasks.length) {
    
                // Create a basic worker task for upgrading
                tasks.push(this.createBasicTask(roomInfo.room.controller, taskType.upgrade));
            }
        }

        return this.prioritiseTasks(tasks, taskHandler, roomInfo);
    }

    /**
     * Generates a default task for workers in this room.
     * @param {Creep} creep The creep to generate the task for.
     * @returns {Task} A newly created 'upgrade' task.
     */
    generateDefaultTask(creep) {
        // Generate a new upgrade task with a priority of zero in case this worker dies and the task is returned to the pool
        return new TaskPoolEntry(this.createBasicTask(creep.room.controller, taskType.upgrade), 0);
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

    /**
     * Assigns priorities to all tasks in the array and returns appropriate TaskPoolEntries for each.
     * @param {Task[]} tasks The array of tasks to assign priorities for.
     * @param {TaskHandler} handler The handler which the tasks will be associated with.
     * @param {RoomInfo} info A RoomInfo object associated with the room the tasks are generated for.
     * @returns {TaskPoolEntry[]} An array of TaskPoolEntries with corresponding priorities for each task. Undefined if no tasks provided.
     */
    prioritiseTasks(tasks, handler, info) {
        return tasks.map((task) => new TaskPoolEntry(task, priorityMap[task.tag](task, handler, info)));
    }
}

// Don't repair these structures too much
const repairThresholds = {
    [STRUCTURE_WALL]: 0.05,
    [STRUCTURE_RAMPART]: 0.075,
    [STRUCTURE_CONTAINER]: 0.5,
    [STRUCTURE_ROAD]: 0.65
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
        return creep.store[RESOURCE_ENERGY] === 0 || !target || target.hits === target.hitsMax;
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
        // If we're above a baseline energy threshold and are closer to our target than our refill with a margin, 
        // skip refilling and go directly to our target instead
        const optionalRefillThreshold = 50;
        const refillDistanceThreshold = 2;
        if (creep.store[RESOURCE_ENERGY] >= optionalRefillThreshold &&
            creep.pos.getRangeTo(target) <= creep.pos.getRangeTo(harvest) + refillDistanceThreshold) {
            return true;
        }
        else if (creep.store[RESOURCE_ENERGY] > 0) {
            // Creep is going to refill, might as well use any remaining energy to repair roads
            const roads = creep.pos.lookFor(LOOK_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_ROAD });
            if (roads && roads[0]) {
                creep.repair(roads[0]);
            }
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
            // Relinquish our current harvest target after completing the task
            delete creep.memory.harvestTarget;
        }
        return full;
    }
};

// Each of these should return a single number for priority
const priorityMap = {
    [taskType.upgrade]: function(task, handler, info) {

        // Big problem here -> emergency upgrade
        if (info.room.controller.ticksToDowngrade <= 1000) {
            return 50;
        }

        // Otherwise, default logic
        // A base of 1 priority, plus an additional 1 priority for each 500 ticks below 5000
        const downgrade = Math.min(Math.floor(info.room.controller.ticksToDowngrade / 500), 10);
        return 11 - downgrade;
    },
    [taskType.restock]: function(task, handler, info) {

        // Need workers urgently
        if (info.workers.length <= 2) {
            return 100;
        }

        // Give a bit of a threshold for both, hence the * 1.2
        const eTier = Math.min(info.room.energyAvailable * 1.2 / info.room.energyCapacityAvailable, 1);
        const workerUrgency = Math.min(info.workers.length / info.openSourceSpots, 1);
        const need = 1 - (eTier * workerUrgency);

        if (need >= 0.9) {
            return 50;
        }
        else if (need >= 0.75) {
            return 14;
        }
        else if (need >= 0.5) {
            return 5;
        }
        return 1;
    },
    [taskType.build]: function(task, handler, info) {
        
        const target = Game.getObjectById(task.target);
        const buildPriorities = {
            [STRUCTURE_STORAGE]: 9,
            [STRUCTURE_CONTAINER]: 5,
            [STRUCTURE_EXTENSION]: 3,
            [STRUCTURE_TOWER]: 3,
            [STRUCTURE_LINK]: 2,
            [STRUCTURE_RAMPART]: 2,
            [STRUCTURE_ROAD]: 2,
            [STRUCTURE_WALL]: 1
        }
        return buildPriorities[target.structureType] || 1;
    },
    [taskType.repair]: function(task, handler, info) {

        // A simple equation, which calculates their fraction of total hits, 
        // factoring in a multiplier for special structures like walls and ramparts
        const target = Game.getObjectById(task.target);
        const multiplier = repairThresholds[target.structureType] || 1;
        const repairNeed = 1 - (target.hits / (target.hitsMax * multiplier));
        return repairNeed * 20;
    },
};

module.exports = WorkerTaskGenerator;