const ageWeight = 1;
const distanceWeight = 1;

class TaskPoolEntry {

    /**
     * Creates a new TaskPoolEntry object.
     * @param {number} priority The base priority of this entry.
     * @param {Task} task The task associated with this entry. 
     */
    constructor(priority, task) {
        this.basePriority = priority;
        this.age = 0;
        this.task = task;
    }

    /**
     * Calculates the priority of this entry.
     * @param {RoomPosition} position The position to use for distance calculations.
     * @returns The weighted priority for this entry.
     */
    getPriority(position) {
        return this.basePriority + 
                (this.age * ageWeight) + 
                (position.getRangeTo(this.task.position) * distanceWeight);
    }

    hasExpired() {
        // TODO
    }

    generateReplacementTask() {
        // TODO
    }
}