class Task {
    
    /**
     * Creates a new task with the following properties:
     * @param {function[]} actions A list of functions to be completed in sequence. Each should take a creep is input 
     * and return true or false to signify whether or not that step has been completed or not.
     * @param {RoomPosition} position The position in game where the task will take place.
     */
    constructor(actions, position) {
        this.actions = actions;
        this.position = position;
    }
}