const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

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
     * Creates a basic worker task that consists of a harvest step, and an action step. 
     * @param {string} targetID The target of the action step of the task.
     * @param {number} taskType One of the taskType constants to use as a tag for the created task.
     * @returns {TaskPoolEntry} A new taskPoolEntry object with an assigned priority and task.
     */
    createBasicTask(targetID, taskType) {

        // Initialize our action stack with a default harvest, plus an action matching the task type
        let actionStack = [];
        actionStack.push(basicWorkerActions["harvest"]);
        actionStack.push(basicWorkerActions[taskType]);

        const task = new Task(targetID, taskType, actionStack);
        const priority = 0; // TODO //

        return new TaskPoolEntry(task, priority);
    }
}

taskType = {
    upgrade: "upgrade",
    restock: "restock",
    build: "build",
    repair: "repair"
}

basicWorkerActions = {
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

        // Gets the closest source of energy in this room, resorting to the storage last
        function getHarvestTarget(creep) {
            const energy = creep.room.find(FIND_DROPPED_RESOURCES, { filter: RESOURCE_ENERGY }).
                push(creep.room.find(FIND_TOMBSTONES).
                push(creep.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER })));
            const closest = !energy.length ? room.storage :
                             energy.reduce((closest, curr) => curr.getRangeTo(creep.pos) < closest.getRangeTo(creep.pos) ? curr : closest);
            creep.memory.pickupTarget = closest.id;
            return closest;
        }

        // If we already have a target, go for that
        if (creep.memory.pickupTarget) {
            let t = Game.getObjectById(creep.memory.pickupTarget);

            // Request a new target if we didn't fill up all the way or lost our target
            if (!t || t.store[RESOURCE_ENERGY] === 0) {
                t = getHarvestTarget(creep);
            }

            const withdrawResult = creep.withdraw(t, RESOURCE_ENERGY);
            if (withdrawResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(t);
            }
            else if (withdrawResult === ERR_INVALID_TARGET) {
                if (creep.pickup(t) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(t);
                }
            }
        }
        else {
            getHarvestTarget(creep);
        }

        return creep.getFreeCapacity() === 0;
    }
}