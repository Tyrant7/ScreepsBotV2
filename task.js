class Task {
    
    /**
     * Creates a new task with the following properties:
     * @param {string} target The object ID of the target. Can be a resource, a structure, a construction site; anything with a position.
     * @param {number} tag A tag to distinguish this task when filtering task types.
     * @param {function()[]} actionStack An array of functions to be executed while completing this task. 
     * Functions will be called in order through the action stack until one returns false.
   */
    constructor(target, tag, actionStack) {
        this.target = target;
        this.tag = tag;
        this.actionStack = actionStack;
    }

    /**
     * Determines whether or not this task has expired by whether or not its target is current present.
     * @returns True if expired, false otherwise
     */
    hasExpired() {
        return !Game.getObjectById(this.target);
    }
}