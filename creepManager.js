class CreepManager {

    constructor(taskGenerator) {
        this.activeTasks = {};
        this.taskGenerator = taskGenerator;
    }

    /**
     * Runs the appropriate task associated with a given creep. If none exists, assigns a new one.
     * @param {Creep} creep The creep to run.
     * @param {RoomInfo} roomInfo Info for the creep's homeroom.
     */
    processCreep(creep, roomInfo) {

        // Let's see if our creep has a task
        let task = this.activeTasks[creep.name];
        if (!task) {  
            // No task -> let's get a new one for this creep and cache it for next time
            task = this.taskGenerator.run(creep, roomInfo, Object.values(this.activeTasks));
            this.activeTasks[creep.name] = task;
        }

        // Run our task
        if (task) {
            this.runTask(creep, task);
        }
    }
    
    /**
     * Runs a given task using a given creep.
     * @param {Creep} creep The creep to run on the given task.
     * @param {Task} task The task to run.
     */
    runTask(creep, task) {
        
        // Debug
        if (DEBUG.logTasks) {
            creep.memory.taskKey = task.tag;
            creep.memory.taskTarget = task.target;
        }

        // Check if current action is completed, if so, we can advance to the next action
        while (task.actionStack[task.actionStackPointer](creep, task.data)) {
            task.actionStackPointer++;

            // All actions were finished, so the task is complete
            if (task.actionStackPointer >= task.actionStack.length) {
                delete this.activeTasks[creep.name];
                break;
            }
        }
    }

    /**
     * Frees all responsiblities for the specified creep.
     * @param {string} name The name of the creep to cancel for.
     */
    freeCreep(name) {
        delete this.activeTasks[name];
    }
}

module.exports = CreepManager;