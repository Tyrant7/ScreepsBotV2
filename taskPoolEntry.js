const ageWeight = 1;
const distanceWeight = 0.5;

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
     * @param {RoomPosition} position The position to use for distance calculations.
     * @returns The weighted priority for this entry.
     */
    getPriority(position) {
        return this.basePriority + 
                (this.age * ageWeight) +
                (position.getRangeTo(Game.getObjectById(this.task.target.pos)) * distanceWeight);
    }

    /**
     * Ages this entry up according to its base priority.
     */
    ageUp() {
        this.age += this.basePriority * agingMultiplier;
    }
}

module.exports = TaskPoolEntry;