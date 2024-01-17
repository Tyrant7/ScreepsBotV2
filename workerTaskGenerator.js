const Task = require("task");

class WorkerTaskGenerator {

    /**
     * Creates a list of appropriate worker tasks for this room.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     */
    run(roomInfo, activeTasks) {

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
        tasks.forEach((task) => task.priority = priorityMap[task.tag](task, roomInfo));
        return tasks;
    }

    /**
     * Generates a default task for workers in this room.
     * @param {Creep} creep The creep to generate the task for.
     * @returns {Task} A newly created 'upgrade' task.
     */
    generateDefaultTask(creep) {
        const task = this.createBasicTask(creep.room.controller, taskType.upgrade);
        task.priority = 0;
        return task;
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
    [STRUCTURE_WALL]: 0.01,
    [STRUCTURE_RAMPART]: 0.03,
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

        // Find the closest site in the creep's homeroom matching its target sturctureType
        // Do this so that all roads or extensions will be built in order of distance instead of all at once
        const home = Game.rooms[creep.memory.home];
        const buildTarget = home.find(FIND_CONSTRUCTION_SITES, { 
            filter: (site) => site.structureType === target.structureType })
            .reduce((closest, curr) => creep.pos.getRangeTo(curr) < creep.pos.getRangeTo(closest) ? curr : closest, target);

        if (creep.build(buildTarget) === ERR_NOT_IN_RANGE) {
            creep.moveTo(buildTarget);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !buildTarget;
    },
    [taskType.repair]: function(creep, target) {
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        return creep.store[RESOURCE_ENERGY] === 0 || !target || target.hits === target.hitsMax;
    },
    "harvest": function(creep, target) {

        // We're done when we can't hold anymore energy
        // -> check this at the beginning of the tick before planning any of our actions
        if (creep.store.getFreeCapacity() === 0) {
            // Relinquish our current harvest target after completing the task
            delete creep.memory.harvestTarget;
            return true;
        }

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

            // We can allow ourselves to target planted haulers
            sources.push(...creep.room.find(FIND_MY_CREEPS, { 
                filter: (c) => c.memory.role === CONSTANTS.roles.hauler && c.memory.openPull && c.memory.planted
            }));

            // Storage
            if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
                sources.push(creep.room.storage);
            }
            
            // We don't have any containers or storage yet, mine our own energy
            if (!sources || !sources.length) {
                sources = creep.room.find(FIND_SOURCES, { filter: (s) => s.energy > 0 });
            }

            // Find the best target -> measured by a blend of distance and energy amount
            const best = sources.reduce(function(best, curr) {
                const bEnergy = best instanceof Source ? best.energy : best instanceof Resource ? best.amount : best.store[RESOURCE_ENERGY];
                const cEnergy = curr instanceof Source ? curr.energy : curr instanceof Resource ? best.amount : curr.store[RESOURCE_ENERGY];
                // Every 25 energy in a container counts as 1 distance closer when prioritising
                const bScore = creep.pos.getRangeTo(best) - (bEnergy / 25);
                const cScore = creep.pos.getRangeTo(curr) - (cEnergy / 25);
                return bScore > cScore ? curr : best;
            });
            creep.memory.harvestTarget = best.id;
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
        else if (creep.store[RESOURCE_ENERGY] > 0 && creep.pos.getRangeTo(harvest) > 1) {
            // Creep is going to refill, might as well use any remaining energy to repair roads
            const roads = creep.pos.lookFor(LOOK_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_ROAD });
            if (roads && roads[0]) {
                creep.repair(roads[0]);
            }
        }

        // If we're too far away from our target energy, look for straggling energy around us to pickup instead
        if (creep.pos.getRangeTo(harvest) > 1) {
            const p = creep.pos;
            if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
                const nearby = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).find((item) => 
                    (item.type === LOOK_RESOURCES && item.resource.resourceType === RESOURCE_ENERGY && item.resource.amount > 0) 
                 || (item.type === LOOK_TOMBSTONES && item.tombstone.store[RESOURCE_ENERGY] > 0) 
                 || (item.type === LOOK_RUINS && item.ruin.store[RESOURCE_ENERGY] > 0)
                // We're free to take energy off of haulers if they aren't doing anything super important
                 || (item.type === LOOK_CREEPS && item.creep.memory && item.creep.memory.openPull));

                // Let's pick something up
                if (nearby) {
                    harvest = nearby[nearby.type];
                }
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
        else if (harvest instanceof Creep) {
            // Ask the openPull creep to give us some energy
            intentResult = harvest.transfer(creep, RESOURCE_ENERGY);
        }
        else {
            intentResult = creep.withdraw(harvest, RESOURCE_ENERGY);
        }
       
        // Move if too far away
        if (intentResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(harvest);
        }
        return false;
    }
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