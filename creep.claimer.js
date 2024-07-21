const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");

class ClaimerManager extends CreepManager {
    createTask(creep, colony) {
        if (creep.memory.target === creep.room.name) {
            if (creep.room.controller.my) {
                // Purpose fulfilled
                return;
            }
            return this.createClaimTask();
        }
        return this.createMoveTask(creep);
    }

    createClaimTask() {
        const actionStack = [
            function (creep, data) {
                if (
                    creep.room.controller.owner &&
                    creep.room.controller.owner.username === ME
                ) {
                    return true;
                }

                if (creep.pos.getRangeTo(creep.room.controller) > 1) {
                    creep.betterMoveTo(creep.room.controller.pos);
                    return false;
                }
                creep.claimController(creep.room.controller);
            },
        ];
        return new Task({}, "claim", actionStack);
    }

    createMoveTask(creep) {
        // If we already have a target let's go with that
        let target = creep.memory.target;
        if (!creep.memory.target) {
            // Validate that we actually have any data
            const d = Memory.scoutData;
            if (!Object.keys(d).length) return;

            // Let's find our best choice that we're not already attempting to claim
            const best = Object.keys(d)
                .filter((k) => !d[k].attemptClaim)
                .reduce((best, curr) =>
                    d[curr].expansionScore > d[best].expansionScore
                        ? curr
                        : best
                );

            if (!best) return;
            target = best;
        }
        const actionStack = [super.basicActions.moveToRoom];
        creep.memory.target = target;
        return new Task(
            { roomName: target, maxRooms: 64, maxOps: 64000 },
            "move",
            actionStack
        );
    }
}

module.exports = ClaimerManager;
