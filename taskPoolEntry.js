const ageWeight = 1;
const distanceWeight = 1;

class TaskPoolEntry {

    constructor(priority, task) {
        this.basePriority = priority;
        this.age = 0;
        this.task = task;
    }

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