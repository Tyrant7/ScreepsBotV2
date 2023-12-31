const TaskHandler = require("taskHandler");

class CreepManager {

    constructor(taskGenerator) {
        this.taskHandlers = {};
        this.taskGenerator = taskGenerator;
    }

    /**
     * Initializes tasks for the specified room. Should be called once at the start of each tick.
     * @param {RoomInfo} roomInfo The room to generate tasks for.
     */
    initializeTasks(roomInfo) {
        
        // Initialize task handler for this room if none exists
        if (!this.taskHandlers[roomInfo.name]) {
            this.taskHandlers[roomInfo.name] = new TaskHandler();
        }
        const handler = this.taskHandlers[roomInfo.name];

        // Push all newly created tasks into the appropriate taskHandler's TaskPool
        const newTasks = this.taskGenerator.run(roomInfo, handler);
        for (const task of newTasks) {
            handler.taskPool.push(task);
        }
    }

    /**
     * Runs the appropriate task associated with a given creep. If none exists, assigns a new one.
     * @param {Creep} creep The creep to run.
     */
    processCreep(creep) {

        // Initialize task handler for this room if none exists
        if (!this.taskHandlers[creep.room.name]) {
            this.taskHandlers[creep.room.name] = new TaskHandler();
        }
        const handler = this.taskHandlers[creep.room.name];

        // Get the current task, or request a new one if none has been assigned
        let task = handler.hasTask(creep.name);
        if (!task) {
            task = handler.nextTask(creep.name);
        }
        this.runTask(creep, task, handler);
    }
    
    /**
     * Runs a given task using a given creep.
     * @param {Creep} creep The creep to run on the given task.
     * @param {Task} task The task to run.
     * @param {TaskHandler} handler The handler associated with the given task.
     */
    runTask(creep, task, handler) {
        
        // Iterate over each action until we find one that hasn't been finished yet
        for (const action of task.actionStack) {
            const target = Game.getObjectById(task.targetID);
            if (action(creep, target)) {
                // This action is finished, we can pop it off of our action stack
                task.actionStack.shift();
            }
            else {
                // This action isn't yet finished, we can stop our chain here
                return;
            }
        }
    
        // All actions were finished, so the task is complete
        handler.finishTask(creep.name);
    }

    /**
     * Frees all responsiblities for the specified creep.
     * @param {string} name The name of the creep to cancel for.
     */
    freeCreep(name) {
        this.taskHandlers[Memory.creeps[name].room].cancelTask(name);
    }
}

module.exports = CreepManager;