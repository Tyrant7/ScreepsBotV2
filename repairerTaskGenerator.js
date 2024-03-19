const Task = require("task");
const harvest = require("harvest");
const estimateTravelTime = require("estimateTravelTime");

class RepairerTaskGenerator {

    /**
     * Creates a new best-fitting task for this creep.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @param {Task[]} activeTasks List of current repairer tasks to take into consideration when finding a new task.
     * @returns The best fitting task object for this creep.
     */
    run(creep, roomInfo, activeTasks) {

        if (!creep.store[RESOURCE_ENERGY]) {
            return new Task({}, "harvest", [harvest]);
        }

        // On the first task, we'll search for the lowest health structure we currently have
        if (!creep.memory.firstPass) {
            const lowest = roomInfo.getWantedStructures().reduce((lowest, curr) => {
                if (!curr.hits) {
                    return lowest;
                }
                const lowestHP = lowest.hits / (lowest.hitsMax * (repairThresholds[lowest.structureType] || 1));
                const currHP = curr.hits / (curr.hitsMax * (repairThresholds[curr.structureType] || 1));
                return currHP < lowestHP ? curr : lowest;
            });
            creep.memory.firstPass = true;
            return this.createRepairTask(lowest);
        }

        // After the first pass, we'll sort by a mix of distance and HP
        const neededRepairs = roomInfo.getWantedStructures().filter((s) => s.hits < s.hitsMax);
        if (neededRepairs.length) {
            const bestFit = neededRepairs.reduce((best, curr) => {

                // Don't bother will ramparts or walls since it will suck up so much energy to repair them
                if ((curr.structureType === STRUCTURE_WALL ||
                    curr.structureType === STRUCTURE_RAMPART) &&
                    curr.hits / curr.hitsMax >= repairThresholds[curr.structureType]) {
                    return best;
                }

                // Simply sort by distance times the fraction of health the structure current has -> closer is better
                const bestRepairNeed = estimateTravelTime(creep, best.pos) 
                    * Math.pow((best.hits / (best.hitsMax * (repairThresholds[best.structureType] || 1))), 3);
                const currRepairNeed = estimateTravelTime(creep, curr.pos) 
                    * Math.pow((curr.hits / (curr.hitsMax * (repairThresholds[curr.structureType] || 1))), 3);
                return currRepairNeed < bestRepairNeed ? curr : best;
            }, neededRepairs[0]);
            return this.createRepairTask(bestFit);
        }
    }

    createRepairTask(target) {
        const actionStack = [function(creep, data) {
            const target = creep.pos.roomName === data.pos.roomName
                ? Game.getObjectById(data.targetID)
                : data.pos;
            if (!target) {
                return true;
            }

            if (creep.pos.getRangeTo(target) <= 3) {
                creep.repair(target);
            }
            else {
                creep.moveTo(target, {
                    reusePath: 30,
                    range: 3,
                });
            }
            return creep.store[RESOURCE_ENERGY] === 0 || target.hits === target.hitsMax;
        }];
        return new Task({ targetID: target.id, pos: target.pos }, "repair", actionStack);
    }
}

// Repair up to these values for these structures
const repairThresholds = {
    [STRUCTURE_WALL]: 0.002,
    [STRUCTURE_RAMPART]: 0.005,
    [STRUCTURE_CONTAINER]: 0.9,
    [STRUCTURE_ROAD]: 0.8,
};

module.exports = RepairerTaskGenerator;