const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class WorkerTaskGenerator {

    run(roomInfo, taskHandler) {

        // Generate tasks to do with workers
        const tasks = [];

        /*
        upgrade: 0,
        restock: 1,
        repair: 2,
        build: 3
        */

        // Start with construction tasks
        const sites = roomInfo.find(FIND_MY_CONSTRUCTION_SITES);
        for (const site in sites) {

            // Don't allow more build tasks than each 5000 energy needed to complete
            const existingTasks = taskHandler.getTasksForObject(site.id);
            if (existingTasks.length >= Math.ceil((site.progressTotal - site.progress) / 5000)) {
                continue;
            }

            const task = new Task(site.id, CONSTANTS.taskType.build);
            const priority = 0; // TODO //
            tasks.push(new TaskPoolEntry(task, priority));
        }

        // Repair tasks
        const repairable = roomInfo.find(FIND_MY_STRUCTURES, { filter: (s) => s.hits < s.hitsMax });
        for (const target in repairable) {
            
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
            const existingTasks = taskHandler.getTasksForObject(target.id, CONSTANTS.taskType.repair);
            if (existingTasks.length &&
               (target.structureType === STRUCTURE_WALL ||
                target.structureType === STRUCTURE_RAMPART)) {
                continue;
            }
            else if (existingTasks.length >= Math.ceil((target.hitsMax - target.hits) / 150_000)) {
                continue;
            }

            const task = new Task(target.id, CONSTANTS.taskType.repair);
            const priority = 0;
            tasks.push(new TaskPoolEntry(task, priority));
        }

        // Restock tasks
        const restockables = roomInfo.find(FIND_MY_STRUCTURES, { filter: (s) => s.store && s.store.getFreeCapacity > 0 });
        for (const restock in restockables) {

            // These will be handled by haulers and miners
            if (restock.structureType === STRUCTURE_CONTAINER ||
                restock.structureType === STRUCTURE_STORAGE) {
                continue;
            }

            // No more than one restock task per object, except before any extensions are built
            const existingTasks = taskHandler.getTasksForObject(target.id, CONSTANTS.taskType.restock);
            if (existingTasks.length && (roomInfo.energyCapacityAvailable > 500 || existingTasks.length >= 3)) {
                continue;
            }

            // All that's left should be towers, spawn, and extensions
            const task = new Task(restock.id, CONSTANTS.taskType.restock);
            const priority = 0;
            tasks.push(new TaskPoolEntry(task, priority));
        }

        // Upgrade tasks

        // Ensure at least one, plus additionals for every so much additional energy income
        const existingTasks = taskHandler.getTasksForObject(roomInfo.controller, CONSTANTS.taskType.upgrade);
        if (!existingTasks.length) {
            const task = new Task(roomInfo.controller, CONSTANTS.taskType.upgrade);
            const priority = 0;
            tasks.push(new TaskPoolEntry(task, priority))
        }
    }
}