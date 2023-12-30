class Task {
    
    /**
     * Creates a new task with the following properties:
     * @param {string} target The object ID of the target. Can be a resource, a structure, a construction site; anything with a position.
     * @param {number} taskType An ID mapping to the intent for this task. Upgrade: 0, restock: 1, etc. Refer to "constants.js" to see all.
   */
    constructor(target, taskType) {
        this.target = target;
        this.taskType = taskType;
    }

    /**
     * Determines whether or not this task has expired by whether or not its target is current present.
     * @returns True if expired, false otherwise
     */
    hasExpired() {
        return !Game.getObjectById(this.target);
    }
}