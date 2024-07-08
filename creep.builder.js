const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const { pathSets } = require("./constants");

/**
 * The number of ticks a builder will request energy before it's finished using its current store.
 */
const REQUEST_ADVANCE_TICKS = 10;

class BuilderManager extends CreepManager {
    /**
     * Creates a build task.
     * @param {Creep} creep The creep to create tasks for.
     * @param {Colony} colony The colony object associated with the room to generate tasks for.
     * @returns The best fitting task object for this creep.
     */
    createTask(creep, colony) {
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
                    .find(
                        (s) => s.structureType === repairTarget.structureType
                    );
                if (
                    constructed &&
                    constructed.hits / constructed.hitsMax < threshold
                ) {
                    return this.createRepairTask(
                        colony,
                        creep,
                        constructed.id,
                        threshold
                    );
                }
            }
        }

        const base = Memory.bases[colony.room.name];
        if (!base) {
            return this.createIdleTask();
        }

        // Look for the first unbuilt target, removing all built target from the queue
        let targetSite;
        while (!targetSite) {
            // Ensure we still have targets
            const buildTarget = base.buildTargets.shift();
            if (!buildTarget) {
                return this.createIdleTask();
            }

            // If this site hasn't been placed yet, we'll wait until next tick to look for it
            if (buildTarget.tick > Game.time) {
                base.buildTargets.unshift(buildTarget);
                return this.createIdleTask();
            }

            // Move to our target's room
            const targetRoom = Game.rooms[buildTarget.pos.roomName];
            if (!targetRoom) {
                // This is a valid target, push it back into the queue
                base.buildTargets.unshift(buildTarget);
                return new Task(
                    {
                        roomName: buildTarget.pos.roomName,
                        maxRooms: 16,
                        maxOps: 4500,
                    },
                    "move",
                    [this.basicActions.moveToRoom]
                );
            }

            targetSite = targetRoom
                .getPositionAt(buildTarget.pos.x, buildTarget.pos.y)
                .lookFor(LOOK_CONSTRUCTION_SITES)[0];

            // Valid target, keep it in the queue
            if (targetSite) {
                base.buildTargets.unshift(buildTarget);
                break;
            }
        }
        return this.createBuildTask(colony, creep, targetSite);
    }

    createIdleTask() {
        return new Task(Game.time, "idle", [
            function (creep, tick) {
                creep.say("Zzz", true);
                return Game.time > tick;
            },
        ]);
    }

    createBuildTask(colony, creep, targetSite) {
        const actionStack = [
            function (creep, { targetID, pos, structureType, useRate }) {
                const target = Game.getObjectById(targetID);
                if (!target) {
                    creep.memory.lastBuilt = { pos, structureType };
                    return true;
                }

                const range = creep.pos.getRangeTo(target);
                const p = creep.pos;
                const onRoomEdge =
                    p.x <= 0 || p.x >= 49 || p.y <= 0 || p.y >= 49;
                if (range > 3 || onRoomEdge) {
                    creep.betterMoveTo(target, {
                        range: 2,
                        pathSet: pathSets.default,
                    });
                }
                if (range <= 3) {
                    creep.build(target);
                    if (
                        creep.store[RESOURCE_ENERGY] <=
                        useRate * REQUEST_ADVANCE_TICKS
                    ) {
                        colony.createDropoffRequest(
                            creep.store.getCapacity(),
                            RESOURCE_ENERGY,
                            [creep.id]
                        );
                    }
                }
            },
        ];
        const useRate =
            creep.body.filter((p) => p.type === WORK).length * BUILD_POWER;
        return new Task(
            {
                targetID: targetSite.id,
                pos: targetSite.pos,
                structureType: targetSite.structureType,
                useRate: useRate,
            },
            "build",
            actionStack
        );
    }

    createRepairTask(colony, creep, targetID, threshold) {
        const actionStack = [
            function (creep, { targetID, threshold, useRate }) {
                const target = Game.getObjectById(targetID);
                if (!target || target.hits / target.hitsMax >= threshold) {
                    return true;
                }

                const range = creep.pos.getRangeTo(target);
                const p = creep.pos;
                const onRoomEdge =
                    p.x <= 0 || p.x >= 49 || p.y <= 0 || p.y >= 49;
                if (range > 3 || onRoomEdge) {
                    creep.betterMoveTo(target, {
                        range: 2,
                        pathSet: pathSets.default,
                    });
                }
                if (range <= 3) {
                    creep.repair(target);
                    if (
                        creep.store[RESOURCE_ENERGY] <=
                        useRate * REQUEST_ADVANCE_TICKS
                    ) {
                        colony.createDropoffRequest(
                            creep.store.getCapacity(),
                            RESOURCE_ENERGY,
                            [creep.id]
                        );
                    }
                }
            },
        ];
        const useRate = creep.body.filter((p) => p.type === WORK).length;
        return new Task(
            { targetID, threshold, useRate },
            "repair",
            actionStack
        );
    }
}

const REPAIR_THRESHOLDS = {
    [STRUCTURE_RAMPART]: 0.01,
    [STRUCTURE_WALL]: 0.005,
};

module.exports = BuilderManager;
