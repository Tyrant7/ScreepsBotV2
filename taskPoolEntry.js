const ageWeight = 1;
const agingMultiplier = 0.5;

class TaskPoolEntry {

    /**
     * Creates a new TaskPoolEntry object.
     * @param {Task} task The task associated with this entry. 
     * @param {number} priority The base priority of this entry.
     */
    constructor(task, priority) {
        this.task = task;
        this.basePriority = priority;
        this.age = 0;
    }

    /**
     * Calculates the priority of this entry.
     * @returns The weighted priority for this entry.
     */
    getPriority() {
        return this.basePriority + 
                (this.age * ageWeight);
    }

    /**
     * Ages this entry up according to its base priority.
     */
    ageUp() {
        this.age += this.basePriority * agingMultiplier;
    }
}

module.exports = TaskPoolEntry;