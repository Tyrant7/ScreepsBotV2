class TaskPool {
    
    constructor() {
        this.tasks = [];
        this.objectTaskMap = {};
    }

    /**
     * Pushes a TaskPoolEntry object into this task pool, and records the task in the object task map.
     * @param {TaskPoolEntry} taskPoolEntry The entry to push.
     */
    push(taskPoolEntry) {
        this.tasks.push(taskPoolEntry);
        
        // Add it to the task map
        const targetID = taskPoolEntry.task.target;
        if (!this.objectTaskMap[targetID]) {
            this.objectTaskMap[targetID] = [];
        }
        this.objectTaskMap[targetID].push(taskPoolEntry);
    }

    /**
     * Returns the highest priority task in the task pool, taking into account base priority, age, and creep positioning.
     * @param {Creep} creep The creep to use for position.
     * @returns {TaskPoolEntry} A TaskPoolEntry object.
     */
    next(creep) {

        // Sort tasks in descending order by priority
        this.tasks.sort((a, b) => b.getPriority(creep.pos) - a.getPriority(creep.pos));

        // Choose the highest priority task that hasn't yet expired
        let chosenTask = this.tasks[0];
        while (!chosenTask.hasExpired()) {

            // The chosen task has expired, we can remove it and update the task map
            this.tasks.shift();
            this.removeTask(chosenTask);

            // Choose new task, if any remain
            if (this.tasks.length) {
                chosenTask = this.tasks[0];
            }
            else {
                // Otherwise, assign a default upgrade task

                // TODO //

            }
        }
        
        // Remove task from pool and update the object task map
        this.tasks.shift();
        this.removeTask(chosenTask);

        return chosenTask;
    }

    /**
     * Removes a task from the object task map
     * @param {TaskPoolEntry} entry The entry to remove for.
     */
    removeTask(entry) {       
        // Update the object task map
        this.objectTaskMap[chosenTask.target].splice(
            this.objectTaskMap[chosenTask.target].indexOf(chosenTask.target), 1
        );
    }

    /**
     * Gets the tasks for a given object.
     * @param {string} ID The ID of the object.
     * @returns {TaskPoolEntry[]} A list of task pool entries for the given object. Undefined if none exist.
     */
    getTasksForObject(ID) {
        return this.objectTaskMap[ID];
    }
}

module.exports = TaskPool;