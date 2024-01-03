const TaskPool = require("taskPool");

class TaskHandler {

    constructor() {
        this.taskPool = new TaskPool();
        this.activeTasks = {};
    }

    /**
     * Returns the task currently associated with the specified creep.
     * @param {Creep} creep The creep to check for association.
     * @returns {Task} The associated task.
     */
    getTask(creep) {
        const taskEntry = this.activeTasks[creep.name];
        if (taskEntry) {
            return taskEntry.task;
        }
        return null;
    }

    /**
     * Returns the next task in the task pool.
     * @param {Creep} creep The creep to reserve this task for.
     * @returns {Task} A new task. Null if no tasks exist in the pool.
     */
    nextTask(creep) {
        const newTask = this.taskPool.next(creep);
        if (newTask) {
            this.activeTasks[creep.name] = newTask;
            return newTask.task;
        }

        // No task in the pool, pass sentinel value up the chain to let the manager decide what to do
        return null;
    }

    /**
     * Marks a task as finished and removes it from the list of active tasks.
     * @param {Creep} creep The creep which finished the task.
     */
    finishTask(creep) {
        delete this.activeTasks[creep.name];
    }

    /**
     * Removes a task from the active task list and adds it back into the task pool.
     * @param {string} name The name of the creep holding this task.
     */
    cancelTask(name) {
        const task = this.activeTasks[name];
        if (task) {
            // Reset the action stack
            task.actionStackPointer = 0;

            // Add task back to pool, and give a priority bonus for returning it
            task.ageUp();
            this.taskPool.push(task);
            delete this.activeTasks[name];
        }
    }

    /**
     * Returns all tasks associated with a given object, including both the task pool and active tasks.
     * @param {string} ID The ID of the object to which tasks are associated.
     * @returns {TaskPoolEntry[]} A list of TaskPoolEntries.
     */
    getTasksForObject(ID) {
        const tasks = [];
        for (const entry of Object.values(this.activeTasks)) {
            if (entry.task.target === ID) {
                tasks.push(entry.task);
            }
        }
        const poolEntries = this.taskPool.getEntriesForObject(ID);
        if (poolEntries) {
            for (const entry of poolEntries) {
                tasks.push(entry.task);
            }
        }
        
        return tasks;
    }

    /**
     * Returns all tasks associated with a given object that match the tag, including both the task pool and active tasks.
     * @param {string} ID The ID of the object to which tasks are associated.
     * @param {number} tag The tag to search for a match with. 
     * @returns {TaskPoolEntry[]} A list of TaskPoolEntry objects matching the given tag and ID.
     */
    getTasksForObjectByTag(ID, tag) {
        return this.getTasksForObject(ID).filter((task) => task.tag === tag);
    }
}

module.exports = TaskHandler;