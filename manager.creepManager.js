const Colony = require("./data.colony");

class CreepManager {
    constructor() {
        this.activeTasks = {};

        /**
         * An array of basic actions available to all creep types.
         * All basic actions should take a reference to the creep as well as some data about the task,
         * and should return a boolean as to whether or not the assigned task was completed this tick.
         */
        this.basicActions = {
            moveToRoom: function (creep, data) {
                // Don't reassign when standing on an exit
                const leavingOrEntering =
                    creep.pos.x >= 49 ||
                    creep.pos.x <= 0 ||
                    creep.pos.y >= 49 ||
                    creep.pos.y <= 0;

                if (creep.room.name === data.roomName && !leavingOrEntering) {
                    return true;
                }

                const pos = new RoomPosition(25, 25, data.roomName);
                creep.betterMoveTo(pos, {
                    range: 23,
                    maxRooms: data.maxRooms,
                    maxOps: data.maxOps,
                    pathSet: data.pathSet,
                });
                return false;
            },
        };
    }

    /**
     * Runs the appropriate task associated with a given creep. If none exists, assigns a new one.
     * @param {Creep} creep The creep to run.
     * @param {Colony} colony Info for the creep's homeroom.
     */
    processCreep(creep, colony) {
        // Skip spawning creeps
        if (creep.spawning) {
            return;
        }

        // Let's see if our creep has a task
        let task = this.activeTasks[creep.name];
        if (!task) {
            // No task -> let's get a new one for this creep and cache it for next time
            task = this.createTask(creep, colony);
            this.activeTasks[creep.name] = task;
        }

        // Run our task
        if (task) {
            this.runTask(creep, task, colony);
        }
    }

    /**
     * Runs a given task using a given creep.
     * @param {Creep} creep The creep to run on the given task.
     * @param {Task} task The task to run.
     * @param {Colony} colony The Info object to use to generate a new task if this one finishes.
     */
    runTask(creep, task, colony) {
        // Debug
        if (DEBUG.logTasks) {
            creep.memory.taskKey = task.tag;
        }

        // Check if current action is completed, if so, we can advance to the next action
        while (
            task.actionStack[task.actionStackPointer] &&
            task.actionStack[task.actionStackPointer](creep, task.data)
        ) {
            task.actionStackPointer++;

            // All actions were finished, so the task is complete
            if (task.actionStackPointer >= task.actionStack.length) {
                // If that's the case, we'll generate a new task,
                // and continue processing it as our current task
                task = this.createTask(creep, colony);
                this.activeTasks[creep.name] = task;
                if (!task) {
                    break;
                }
            }
        }
    }

    /**
     * Frees all responsiblities for the specified creep.
     * @param {string} name The name of the creep to cancel for.
     */
    freeCreep(name) {
        delete this.activeTasks[name];
    }

    /**
     * Creates an appropriate task for this creep.
     * @param {Creep} creep The creep to create a task for.
     * @param {Colony} colony The colony object that owns the creep.
     * @returns {Task} A new Task object.
     */
    createTask(creep, colony) {
        throw new Error("You must implement createTask()");
    }

    /**
     * Displays that this creep is idle using a 'say' intent.
     * @param {string} message An additional message to display. Limited to 6 characters.
     */
    alertIdleCreep(creep, message) {
        if (DEBUG.alertOnIdle) {
            creep.say("💤" + message);
        }
    }
}

module.exports = CreepManager;
