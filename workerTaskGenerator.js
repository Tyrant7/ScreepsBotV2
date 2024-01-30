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

        // Generate tasks to do with workers
        const tasks = [];

        // Start with construction tasks
        const sites = roomInfo.room.find(FIND_MY_CONSTRUCTION_SITES);
        for (const site of sites) {

            // Don't allow more build tasks than each 10,000 energy needed to complete
            const existingTasks = activeTasks.filter((task) => task.target === site.id);
            if (existingTasks.length >= Math.ceil((site.progressTotal - site.progress) / 10000)) {
                continue;
            }

            // Create a basic worker task for building
            tasks.push(this.createBasicTask(site, taskType.build));
        }
        
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
                tasks.push(this.createBasicTask(restock, taskType.restock));
            }
        }

        // Repair tasks
        const repairable = roomInfo.room.find(FIND_STRUCTURES, { filter: (s) => s.hits < s.hitsMax });
        for (const target of repairable) {
            
            if (repairThresholds[target.structureType] &&
                target.hits / target.hitsMax >= repairThresholds[target.structureType]) {
                continue;
            }

            // One repair task per target for each 150k health missing, max one for walls and ramparts
            const existingTasks = activeTasks.filter((task) => task.target === target.id && task.tag === taskType.repair);
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

        // Upgrade tasks -> ensure at least one at all times
        if (roomInfo.room.controller.my) {
            const existingTasks = activeTasks.filter((task) => task.target === roomInfo.room.controller.id && task.tag === taskType.upgrade);
            if (!existingTasks.length) {
                // Create a basic worker task for upgrading
                tasks.push(this.createBasicTask(roomInfo.room.controller, taskType.upgrade));
            }
        }

        // Prioritise all of our tasks and return them
        const distanceWeight = 0.35;
        tasks.forEach((task) => task.priority = priorityMap[task.tag](task, roomInfo) +
        // Apply weights to each task's priority based on distance to the requesting creep only if 
        // the requesting creep has enough energy remaining to fill an extension
            (creep.store[RESOURCE_ENERGY] >= EXTENSION_ENERGY_CAPACITY[roomInfo.room.controller.level] 
            ? Math.ceil(creep.pos.getRangeTo(Game.getObjectById(task.target)) * distanceWeight) : 0));

        // Let's push a default task in case we're out of other options
        const defaulTask = this.createBasicTask(roomInfo.room.controller, taskType.upgrade);
        defaulTask.priority = -1000;
        tasks.push(defaulTask);

        return tasks;
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

        if (creep.build(buildTarget) === ERR_NOT_IN_RANGE) {
            creep.moveTo(buildTarget);
        }
        return creep.store[RESOURCE_ENERGY] === 0;
    },
    [taskType.repair]: function(creep, target) {
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target || target.hits === target.hitsMax;
    },
    "harvest": harvest,
};

// Each of these should return a single number for priority
const priorityMap = {
    [taskType.upgrade]: function(task, info) {

        // Big problem here -> emergency upgrade
        if (info.room.controller.ticksToDowngrade <= 1000) {
            return 50;
        }

        // Otherwise, default logic
        // A base of 1 priority, plus an additional 1 priority for each 500 ticks below 5000
        const downgrade = Math.min(Math.floor(info.room.controller.ticksToDowngrade / 500), 10);
        return 11 - downgrade;
    },
    [taskType.restock]: function(task, info) {

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
            return 13;
        }
        else if (need >= 0.5) {
            return 5;
        }
        return 1;
    },
    [taskType.build]: function(task, info) {
        
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
    [taskType.repair]: function(task, info) {

        // A simple equation, which calculates their fraction of total hits, 
        // factoring in a multiplier for special structures like walls and ramparts
        const target = Game.getObjectById(task.target);
        const multiplier = repairThresholds[target.structureType] || 1;
        const repairNeed = 1 - (target.hits / (target.hitsMax * multiplier));
        return repairNeed * 20;
    },
};

module.exports = WorkerTaskGenerator;