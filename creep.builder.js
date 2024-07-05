const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const estimateTravelTime = require("./util.estimateTravelTime");
const { pathSets } = require("./constants");

class BuilderManager extends CreepManager {
    /**
     * Creates a build task.
     * @param {Creep} creep The creep to create tasks for.
     * @param {RoomInfo} roomInfo The info object associated with the room to generate tasks for.
     * @returns The best fitting task object for this creep.
     */
    createTask(creep, roomInfo) {
        if (creep.memory.lastBuilt) {
            const repairTarget = creep.memory.lastBuilt;
            delete creep.memory.lastBuilt;

            // Make sure we repair the constructed structure up to our repair threshold
            const threshold = REPAIR_THRESHOLDS[repairTarget.structureType];
            if (threshold) {
                const constructed = creep.room
                    .lookForAt(
                        LOOK_STRUCTURES,
                        repairTarget.pos.x,
                        repairTarget.pos.y
                    )
                    .filter(
                        (s) => s.structureType === repairTarget.structureType
                    );
                if (
                    constructed &&
                    constructed.hits / constructed.hitsMax < threshold
                ) {
                    return this.createRepairTask(constructed.id, threshold);
                }
            }
        }

        const base = Memory.bases[roomInfo.room.name];
        if (!base) {
            return null;
        }

        // Look for the first unbuilt target, removing all built target from the queue
        let targetSite;
        while (!targetSite) {
            // Ensure we still have targets
            const buildTarget = base.buildTargets.shift();
            if (!buildTarget) {
                creep.say("No targets");
                return null;
            }

            // Move to our target's room
            const targetRoom = Game.rooms[buildTarget.roomName];
            if (!targetRoom) {
                // This is a valid target, push it back into the queue
                base.buildTargets.unshift(buildTarget);
                return new Task(
                    { roomName: targetRoom, maxRooms: 16, maxOps: 4500 },
                    "move",
                    [this.basicActions.moveToRoom]
                );
            }

            targetSite = targetRoom
                .getPositionAt(base.buildTarget.x, base.buildTarget.y)
                .lookFor(LOOK_CONSTRUCTION_SITES)[0];

            // Valid target, keep it in the queue
            if (targetSite) {
                base.buildTargets.unshift(buildTarget);
            }
        }
        return this.createBuildTask(targetSite);
    }

    createBuildTask(targetSite) {
        const actionStack = [
            function (creep, { targetID, pos, structureType }) {
                const target = Game.getObjectById(targetID);
                if (!target) {
                    creep.memory.lastBuilt = { pos, structureType };
                    return true;
                }
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.betterMoveTo(target, {
                        range: 2,
                        pathSet: pathSets.default,
                    });
                } else {
                    // We'll always have a dropoff request open for haulers
                    roomInfo.createDropoffRequest(
                        creep.store.getCapacity(),
                        RESOURCE_ENERGY,
                        [creep.id]
                    );
                }
            },
        ];
        return new Task(
            {
                targetID: targetSite.id,
                pos: targetSite.pos,
                structureType: targetSite.structureType,
            },
            "build",
            actionStack
        );
    }

    createRepairTask(targetID, threshold) {
        const actionStack = [
            function (creep, { targetID, threshold }) {
                const target = Game.getObjectById(targetID);
                if (!target || target.hits / target.hitsMax >= threshold) {
                    return true;
                }
                if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                    creep.betterMoveTo(target, {
                        range: 2,
                        pathSet: pathSets.default,
                    });
                } else {
                    // We'll always have a dropoff request open for haulers
                    roomInfo.createDropoffRequest(
                        creep.store.getCapacity(),
                        RESOURCE_ENERGY,
                        [creep.id]
                    );
                }
            },
        ];
        return new Task({ targetID, threshold }, "repair", actionStack);
    }
}

const REPAIR_THRESHOLDS = {
    [STRUCTURE_RAMPART]: 0.01,
    [STRUCTURE_WALL]: 0.005,
};

module.exports = BuilderManager;
