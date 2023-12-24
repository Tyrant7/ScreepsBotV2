TaskPool = require("taskPool");

class TaskHandler {

    constructor() {
        this.taskPool = new TaskPool();
        this.activeTasks = {};
    }

    /**
     * Returns the task currently associated with the specified creep.
     * @param {string} name The name of the creep to check for association.
     * @returns {Task} The associated task.
     */
    hasTask(name) {
        const taskEntry = this.activeTasks[name];
        if (taskEntry) {
            return taskEntry.task;
        }
        return null;
    }

    /**
     * Returns the next task in the task pool.
     * @param {Creep} creep The creep to use for priority calculations.
     * @returns {Task} A new task.
     */
    nextTask(creep) {
        const newTask = this.taskPool.next(creep);
        this.activeTasks[creep.name] = newTask;
        return newTask.task;
    }

    /**
     * Marks a task as finished and removes it from the list of active tasks.
     * @param {string} name The name of the creep which finished the task.
     */
    finishTask(name) {
        delete this.activeTasks[name];
    }

    /**
     * Removes a task from the active task list and adds it back into the task pool.
     * @param {string} name The name of the creep holding this task.
     */
    cancelTask(name) {
        const task = this.activeTasks[name];
        if (task) {
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
        for (const task of this.activeTasks) {
            if (task.target === ID) {
                tasks.push(task);
            }
        }
        tasks.push(this.taskPool.getTasksForObject(ID));
        return tasks;
    }
}

module.exports = new TaskHandler();