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
            task = this.getBestTask(creep, roomInfo);
            this.activeTasks[creep.name] = task;
        }

        // Run our task
        if (task) {
            this.runTask(creep, task);
        }
    }


    getBestTask(creep, roomInfo) {

        // Generate a list of possible tasks for this creep's role
        const tasks = this.taskGenerator.run(creep, roomInfo, Object.values(this.activeTasks));

        // We should always have an least one task in this array
        // So if this triggers, we likely haven't implemented this task generator yet
        if (!tasks || !tasks.length) {
            return;
        }

        // Find the highest priority task
        const bestTask = tasks.reduce((highest, curr) => curr.priority > highest.priority ? curr : highest);
        return bestTask;
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

        // Find our associated target 
        // -> if it's not a valid ID let's let the creep handle it in cases like scouts or remote builders taking room names as targets
        const target = Game.getObjectById(task.target) || task.target;

        // Check if current action is completed, if so, we can advance to the next action
        while (task.actionStack[task.actionStackPointer](creep, target)) {
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