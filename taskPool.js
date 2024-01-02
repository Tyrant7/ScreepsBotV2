class TaskPool {
    
    constructor() {
        this.entries = [];
        this.objectTaskMap = {};
    }

    /**
     * Pushes a TaskPoolEntry object into this task pool, and records the task in the object task map.
     * @param {TaskPoolEntry} taskPoolEntry The entry to push.
     */
    push(taskPoolEntry) {
        this.entries.push(taskPoolEntry);
        
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
     * @returns {TaskPoolEntry} A TaskPoolEntry object. Null if no entries remain in the pool.
     */
    next(creep) {

        // No entries, let it decide on a default task higher up the line
        if (this.isEmpty()) {
            return null;
        }

        // Sort entries in descending order by priority
        this.entries.sort((a, b) => b.getPriority(creep.pos) - a.getPriority(creep.pos));

        // Choose the highest priority task that hasn't yet expired
        let chosenEntry = this.entries.shift();
        while (chosenEntry.task.hasExpired()) {

            // The chosen task has expired, we can remove it and update the task map
            this.removeEntry(chosenEntry);

            // Choose new task, if any remain
            if (this.entries.length) {
                chosenEntry = this.entries.shift();
            }
            else {
                // Otherwise, return null as no entries remain
                return null;
            }
        }
        
        // Update the object task map
        this.removeEntry(chosenEntry);

        // Age up any remaining entries
        for (const entry of this.entries) {
            entry.ageUp();
        }

        return chosenEntry;
    }

    /**
     * Removes a task from the object task map
     * @param {TaskPoolEntry} entry The entry to remove for.
     */
    removeEntry(entry) {       
        // Update the object task map
        const i = this.objectTaskMap[entry.task.target].indexOf(entry);
        this.objectTaskMap[entry.task.target].splice(i, 1);
    }

    /**
     * Use to determine if this task pool is empty.
     * @returns True if empty, false otherwise.
     */
    isEmpty() {
        return this.entries.length === 0;
    }

    /**
     * Gets the entries for a given object.
     * @param {string} ID The ID of the object.
     * @returns {TaskPoolEntry[]} A list of task pool entries for the given object. Null if none exist.
     */
    getEntriesForObject(ID) {
        return this.objectTaskMap[ID] ? Object.values(this.objectTaskMap[ID]) : null;
    }
}

module.exports = TaskPool;