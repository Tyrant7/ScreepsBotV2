const CreepManager = require("./creepManager");
const Task = require("./task");

class RepairerManager extends CreepManager {

    /**
     * Creates a new best-fitting task for this creep.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @returns The best fitting task object for this creep.
     */
    createTask(creep, roomInfo) {

        if (!creep.store[RESOURCE_ENERGY]) {
            return new Task({}, "harvest", [this.basicActions.seekEnergy]);
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

        // After the first pass, we'll search for the lowest structure in our current room
        const neededRepairs = creep.room.find(FIND_STRUCTURES).filter((s) => {
            // Don't bother will ramparts or walls since it will suck up so much energy to repair them
            if ((s.structureType === STRUCTURE_WALL ||
                s.structureType === STRUCTURE_RAMPART) &&
                s.hits / s.hitsMax >= repairThresholds[s.structureType]) {
                return false;
            }
            return s.hits < s.hitsMax;
        });
        if (neededRepairs.length) {
            const mapped = neededRepairs.map((s) => {
                // Simply sort by distance times the fraction of health the structure current has -> closer = lower score = better
                const score = creep.pos.getRangeTo(s.pos)
                    * Math.pow((s.hits / (s.hitsMax * (repairThresholds[s.structureType] || 1))), 3);
                return { structure: s, score: score };
            });
            const bestFit = mapped.reduce((best, curr) => curr.score < best.score ? curr : best, mapped[0]).structure;
            return this.createRepairTask(bestFit);
        }
        else {
            // If none need repairing, let's search through all of our structures again
            creep.memory.firstPass = false;
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
                    range: 3,
                    pathSet: CONSTANTS.pathSets.default,
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

module.exports = RepairerManager;