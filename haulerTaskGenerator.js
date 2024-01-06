const Task = require("task");
const TaskPoolEntry = require("taskPoolEntry");

class HaulerTaskGenerator {

    run(roomInfo, taskHandler) {
        // Nothing to do here; haulers do not need special tasks
    }

    generateDefaultTask(creep) {

        // Generate default hauler behaviour
        const actionStack = [];
        actionStack.push(function(creep, target) {

            // Let's make sure our path actually exists
            const path = Memory.rooms[creep.room.name].haulerPaths[creep.memory.pathKey];
            if (!path) {
                console.log("Invalid path assigned to hauler: " + creep.name);
                return;
            }
            else if (!creep.room.storage) {
                console.log("Hauler but no storage in " + creep.room.name);
                return;
            }

            // If we've recently been spawned, we should have a negative path pointer
            // Let's search for the nearest point on our path to start following it
            if (creep.memory.pathPointer < 0) {
                const nearestPoint = path.reduce(function(closest, curr) {
                    // Paths stored in memory lose their types, so we have to reinitialize them
                    if (!(closest instanceof RoomPosition)) {
                        closest = new RoomPosition(closest.x, closest.y, closest.roomName);
                    }
                    const current = new RoomPosition(curr.x, curr.y, curr.roomName);
                    return creep.pos.getRangeTo(closest) > creep.pos.getRangeTo(current) ? current : closest;
                });

                // console.log("nearestX: " + nearestPoint.x + " nearestY: " + nearestPoint.y);

                // If we're close enough to this point to move to it immediately, then we're good
                const dist = creep.pos.getRangeTo(nearestPoint);
                if (dist <= 1) {
                    // Figure out which point we actually chose
                    let pathPointer = path.findIndex(
                        (point) => point.x === nearestPoint.x 
                                && point.y === nearestPoint.y 
                                && point.roomName === nearestPoint.roomName);

                    // If we're standing on the path, advance the pointer once towards the source
                    if (dist === 0) {
                        pathPointer--;
                    }
                    creep.memory.pathPointer = pathPointer;
                }
                // We're too far to start on our path, let's move towards the closest point until we've entered the path
                else {
                    creep.moveTo(nearestPoint);
                    return false;
                }
            }
            
            // We're somewhere within range of our assigned path
            // Let's move to the next space and advance the pointer
            const pathPointer = creep.memory.pathPointer;

            // We're next to the storage, let's deposit everything
            if (creep.store[RESOURCE_ENERGY] > 0 && creep.pos.getRangeTo(creep.room.storage) <= 1) {
                creep.transfer(creep.room.storage, RESOURCE_ENERGY);
                creep.memory.pathPointer--;
                console.log("depositing...");
                return false;
            }

            // Move along our path
            const step = new RoomPosition(path[pathPointer].x, path[pathPointer].y, path[pathPointer].roomName);
            const dir = creep.pos.getDirectionTo(step);
            creep.move(dir);

            // Look for energy to pickup around us
            const p = creep.pos;
            const nearby = creep.room.lookAtArea(p.y-1, p.x-1, p.y+1, p.x+1, true).filter((item) => 
                (item.type === LOOK_RESOURCES && item.resource.resourceType === RESOURCE_ENERGY && item.resource.amount > 0) 
             || (item.type === LOOK_TOMBSTONES && item.tombstone.store[RESOURCE_ENERGY] > 0) 
             || (item.type === LOOK_RUINS && item.ruin.store[RESOURCE_ENERGY] > 0) 
             || (item.type === LOOK_STRUCTURES && item.structure.structureType === STRUCTURE_CONTAINER 
                // Verify that this is our container to pull from by checking it's distance to our source
             && Game.getObjectById(creep.memory.pathKey).getRangeTo(item.structure) <= 1))
             // This line just extracts out the type of the object, so the structure of strucutres, the resource of resources, etc.
             .map((item) => item[item.type]);
        
            // Let's pickup this nearby energy if we've space for it
            if (creep.store.getFreeCapacity()) {
                for (const n of nearby) {
                    if (n instanceof Resource) {
                        creep.pickup(n);
                    }
                    else {
                        creep.withdraw(n, RESOURCE_ENERGY);
                    }
                }
            }

            // Finally, let's advance our path if we've moved
            // Increment the path pointer if we're going towards the storage
            // Decrement if we're going towards the source
            const prevP = creep.memory.previousPos;
            if (!prevP || p.x !== prevP.x || p.y !== prevP.y || p.roomName !== prevP.roomName) {
                creep.memory.pathPointer += creep.store.getFreeCapacity() ? -1 : 1;
                creep.memory.pathPointer = Math.max(creep.memory.pathPointer, 0);
            }
            creep.memory.previousPos = creep.pos;

            return false;
        });

        const task = new Task(creep.memory.pathKey, "haul", actionStack);
        return new TaskPoolEntry(task, 0);
    }
}

module.exports = HaulerTaskGenerator;