const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class HaulerTaskGenerator {

    run(roomInfo, taskHandler) {

        // Generate some tasks for haulers, namely:
        // Restock tasks
        // transport tasks between miner and storage
        // Deliver tasks from anywhere to the controller
        const tasks = [];

        // Starting with restock tasks
        const restockables = roomInfo.room.find(FIND_MY_STRUCTURES, { filter: (s) => s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        for (const restock of restockables) {

            // These will be handled by other tasks
            if (restock.structureType === STRUCTURE_CONTAINER ||
                restock.structureType === STRUCTURE_STORAGE) {
                continue;
            }

            // No more than one restock task per object
            const existingTasks = taskHandler.getTasksForObjectByTag(restock.id, taskType.restock);
            if (existingTasks.length) {
                continue;
            }

            // All that's left should be towers, spawn, and extensions
            // Create a task comprised of harvesting and restocking
            const actionStack = [];
            actionStack.push(basicActions["harvest"]);
            actionStack.push(basicActions[taskType.restock]);
            tasks.push(new Task(restock.id, taskType.restock, actionStack));
        }

        // Transfer tasks next
        // For every source with a miner, dedicate a specific task to hauling its mined energy to the main storage
        if (roomInfo.room.storage) {
            for (const miner of roomInfo.miners) {

                // No more than one hauler per miner
                const existingTasks = taskHandler.getTasksForObjectByTag(miner.id, taskType.transport);
                if (existingTasks.length) {
                    continue;
                }
    
                // Create a task to transfer the energy from this miner's position to the storage
                tasks.push(new Task(miner.id, taskType.transport, [basicActions[taskType.transport]]));
            }
        }

        // Deliver task for controller
        const existingTasks = taskHandler.getTasksForObjectByTag(roomInfo.room.controller.id, taskType.deliver);
        if (!existingTasks.length) {

            // Create a new task to deliver energy to the controller

            // TODO //
            // For now this will just move to the controller and stop
            // We want to pass it something to transfer into
            // Likely a container near the controller where upgraders will sit

            const actionStack = [];
            actionStack.push(basicActions["harvest"]);
            actionStack.push(basicActions[taskType.deliver]);
            tasks.push(new Task(roomInfo.room.controller.id, taskType.deliver, actionStack));
        }

        // Prioritise all of our tasks and return new entries for them
        return this.prioritiseTasks(tasks, taskHandler, roomInfo);
    }

    /**
     * Generates a default deliver task for haulers.
     * @param {Creep} creep The creep to generate the task for.
     * @returns {TaskPoolEntry} A newly created entry for a 'deliver' task.
     */
    generateDefaultTask(creep) {
        const deliverTask = new Task(creep.room.controller.id, taskType.deliver, [basicActions[taskType.deliver]]);
        return new TaskPoolEntry(deliverTask, 0);
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


const taskType = {
    transport: "transport",
    deliver: "deliver",
    restock: "restock",
};

const basicActions = {
    // Transports energy from 'target' to the room's storage
    [taskType.transport]: function(creep, target) {

        console.log("transport");

        // If there's no storage in this creep's home, we're done
        const storage = Game.rooms[creep.memory.home].storage;
        if (!storage) {
            delete creep.memory.openPull;
            return true;
        }

        // If we've already grabbed our energy and still have some, let's transport
        if (creep.memory.visitedTarget && creep.store[RESOURCE_ENERGY]) {
            const transferResult = creep.transfer(storage, RESOURCE_ENERGY);
            if (transferResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);

                // Let workers know that they can pull energy off of this hauler if need be
                creep.memory.openPull = true;
            }
            else if (transferResult === OK) {
                // We're done!
                delete creep.memory.visitedTarget;
                delete creep.memory.openPull;
                return true;
            }
            return false;
        }

        // Otherwise, let's go get it
        let harvest = creep.room.lookForAt(LOOK_STRUCTURES, target).find((s) => s.structureType === STRUCTURE_CONTAINER);
        if (creep.pos.getRangeTo(harvest) <= 1) {

            // We've some energy and we've gone all the way there, let's flag ourselves to start going back
            if (creep.store[RESOURCE_ENERGY]) {
                creep.memory.visitedTarget = true;
            }
        }

        // If we're not there yet, or didn't find a container...
        if (!harvest) {
            // We can search the floor near us for energy
            const p = creep.pos;
            if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
                const nearby = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).find((item) => 
                    (item.type === LOOK_RESOURCES && item.resource.resourceType === RESOURCE_ENERGY) 
                 || (item.type === LOOK_TOMBSTONES && item.tombstone.store[RESOURCE_ENERGY] > 0) 
                 || (item.type === LOOK_RUINS && item.ruin.store[RESOURCE_ENERGY] > 0))
                if (nearby) {
                    harvest = nearby;
                }
            }
        }

        const intentResult = harvest instanceof Resource ? creep.pickup(harvest) : creep.withdraw(harvest, RESOURCE_ENERGY);
        if (intentResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(harvest);
        }
        return false;
    },
    // Delivers the creep's current inventory to target
    [taskType.deliver]: function(creep, target) {

        console.log("deliver");


        // Let workers know that this hauler is open to pull energy off of if needed
        creep.memory.openPull = true;

        // Our inventory is empty -> nothing to deliver
        if (!creep.store[RESOURCE_ENERGY]) {
            delete creep.memory.openPull;
            return true;
        }

        const transferResult = creep.transfer(target, RESOURCE_ENERGY);
        if (transferResult === ERR_NOT_IN_RANGE ||
            // Just in case we're going towards the controller
            (target.id === creep.room.controller.id && creep.pos.getRangeTo(target) > 3)) {
            creep.moveTo(target);
        }
        else if (transferResult === OK) {
            delete creep.memory.openPull;
            return true;
        }
        return false;
    },
    // Restocks an extensions or spawn in the creep's room
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
    // Harvests from whatever target is closest in the creep's room
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
        const energy = !harvest ? 0 : harvest instanceof Resource ? harvest.amount : 
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
            
            // We've got nothing to collect from -> simply wait
            if (!sources.length) {
                return false;
            }

            // Find the best target -> measured by a blend of distance and energy amount
            const best = sources.reduce(function(best, curr) {
                const bEnergy = best instanceof Resource ? best.amount : best.store[RESOURCE_ENERGY];
                const cEnergy = curr instanceof Resource ? best.amount : curr.store[RESOURCE_ENERGY];
                // Every 25 energy in a container counts as 1 distance closer when prioritising
                const bScore = creep.pos.getRangeTo(best) - (bEnergy / 25);
                const cScore = creep.pos.getRangeTo(curr) - (cEnergy / 25);
                return bScore > cScore ? curr : best;
            });
            creep.memory.harvestTarget = best.id;
            harvest = Game.getObjectById(creep.memory.harvestTarget);
        }

        // If we're too far away from our target energy, look for straggling energy around us to pickup instead
        if (creep.pos.getRangeTo(harvest) > 1) {
            const p = creep.pos;
            if (p.x !== 0 && p.x !== 49 && p.y !== 0 && p.y !== 49) {
                const nearby = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).find((item) => 
                    (item.type === LOOK_RESOURCES && item.resource.resourceType === RESOURCE_ENERGY) 
                 || (item.type === LOOK_TOMBSTONES && item.tombstone.store[RESOURCE_ENERGY] > 0) 
                 || (item.type === LOOK_RUINS && item.ruin.store[RESOURCE_ENERGY] > 0))

                // Let's pick something up
                if (nearby) {
                    harvest = nearby[nearby.type];
                }
            }
        }

        // Determine what type of intent to use to gather this energy
        const intentResult = harvest instanceof Resource ? creep.pickup(harvest) 
            : creep.withdraw(harvest, RESOURCE_ENERGY);
       
        // Move if too far away
        if (intentResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(harvest);
        }
        return false;
    }
};

// Each of these should return a single number for priority
const priorityMap = {
    [taskType.transport]: function(task, handler, info) {
        // TODO //
        return 1;
    },
    [taskType.deliver]: function(task, handler, info) {
        // TODO //
        return 3;
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
            return 13;
        }
        else if (need >= 0.5) {
            return 5;
        }
        return 1;
    },
};

module.exports = HaulerTaskGenerator;