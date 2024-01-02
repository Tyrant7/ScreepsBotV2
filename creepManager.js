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
        if (newTasks) {
            for (const task of newTasks) {
                handler.taskPool.push(task);
            }
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
        let task = handler.getTask(creep);
        if (!task) {
            // The pool is empty and we should add a default task
            if (handler.taskPool.isEmpty()) {
                handler.taskPool.push(this.taskGenerator.generateDefaultTask(creep));
            }
            task = handler.nextTask(creep);
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
        
        // Find our associated target
        const target = Game.getObjectById(task.target);

        // Check if current action is completed, if so, we can advance to the next action
        if (task.actionStack[task.actionStackPointer](creep, target)) {
            task.actionStackPointer++;
        }
    
        // All actions were finished, so the task is complete
        if (task.actionStackPointer >= task.actionStack.length) {
            handler.finishTask(creep);
        }
    }

    /**
     * Frees all responsiblities for the specified creep.
     * @param {string} name The name of the creep to cancel for.
     */
    freeCreep(name) {
        const handler = this.taskHandlers[Memory.creeps[name].room];
        if (handler) {
            handler.cancelTask(name);
        }
    }
}

module.exports = CreepManager;