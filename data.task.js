class Task {
    /**
     * Creates a new task with the following properties:
     * @param {{}} data Info about this task. Can contain info about pretty much anything; a structure, a construction site, etc.
     * @param {string} tag A tag to distinguish this task when filtering task types.
     * @param {function[]} actionStack An array of functions to be executed while completing this task.
     * Functions will be called in order through the action stack until one returns false.
     * Functions that return true will be popped off of the stack.
     * Functions that return true should do so BEFORE scheduling any intents to ensure
     * that the followup task does not overwrite the previously scheduled intents.
     */
    constructor(data, tag, actionStack) {
        this.data = data;
        this.tag = tag;
        this.actionStack = actionStack;
        this.actionStackPointer = 0;
    }
}

module.exports = Task;
