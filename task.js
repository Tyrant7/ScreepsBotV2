class Task {
    
    /**
     * Creates a new task with the following properties:
     * @param {string} target The object ID of the target. Can be a resource, a structure, a construction site; anything with a position.
     * @param {number} tag A tag to distinguish this task when filtering task types.
     * @param {function[]} actionStack An array of functions to be executed while completing this task. 
     * Functions will be called in order through the action stack until one returns false.
     * @param {number} priority The priority of this task. Higher priority tasks will be chosen over lower priority tasks. Default of 0.
   */
    constructor(target, tag, actionStack, priority = 0) {
        this.target = target;
        this.tag = tag;
        this.actionStack = actionStack;
        this.actionStackPointer = 0;
        this.priority = priority;
    }
}

module.exports = Task;