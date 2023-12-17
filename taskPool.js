class TaskPool {
    
    constructor() {
        this.tasks = [];
    }

    /**
     * Pushes a TaskPoolEntry object into this task pool.
     * @param {TaskPoolEntry} taskPoolEntry The entry to push.
     */
    push(taskPoolEntry) {
        this.tasks.push(taskPoolEntry);
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

            // The chosen task has expired, we can remove it and add a replacement task
            const replacementTask = chosenTask.generateReplacementTask();
            if (replacementTask) {
                this.tasks.push(replacementTask);
            }
            this.tasks.shift();

            // Choose new task, if any remain
            if (this.tasks.length) {
                chosenTask = this.tasks[0];
            }
            else {
                // Otherwise, assign a default upgrade task

                // TODO //

            }
        }
        
        this.tasks.shift();
        return chosenTask;
    }
}

module.exports = TaskPool;