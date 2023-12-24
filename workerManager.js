TaskHandler = require("taskHandler");

class WorkerManager {

    constructor() {
        this.taskHandler = new TaskHandler();
    }

    /**
     * Runs the appropriate task associated with a given worker creep. If none exists, assigns a new one.
     * @param {Creep} creep The worker creep to run.
     */
    processWorker(creep) {

        // Get the current task, or request a new one if none has been assigned
        let task = this.taskHandler.hasTask(creep.name);
        if (!task) {
            task = this.taskHandler.nextTask(creep.name);
        }
        runTask(creep, task);
    }
    
    /**
     * Runs a given task using a given creep.
     * @param {Creep} creep The creep to run on the given task.
     * @param {Task} task The task to run.
     */
    runTask(creep, task) {
        
        // Iterate over each action until we find one that hasn't been finished yet
        for (const action of task.actions) {
            if (!action(creep)) {
                // This action isn't yet finished, we can stop our chain here
                return;
            }
        }
    
        // All actions were finished, so the task is complete
        this.taskHandler.finishTask(creep.name);
    }

    /**
     * Cancels tasks for the specified work.
     * @param {string} name The name of the worker to cancel for.
     */
    workerDeath(name) {
        this.taskHandler.cancelTask(name);
    }
}

module.exports = new WorkerManager();