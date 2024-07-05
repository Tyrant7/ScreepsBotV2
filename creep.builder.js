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
        const base = Memory.bases[roomInfo.room.name];
        if (!base) {
            return null;
        }
        const buildTarget = base.buildTargets.slice(-1)[0];
        if (!buildTarget) {
            creep.say("No targets");
            return null;
        }
        const targetRoom = Game.rooms[buildTarget.roomName];
        if (!targetRoom) {
            return new Task(
                { roomName: targetRoom, maxRooms: 16, maxOps: 4500 },
                "move",
                [this.basicActions.moveToRoom]
            );
        }
        const targetSite = targetRoom
            .getPositionAt(base.buildTarget.x, base.buildTarget.y)
            .lookFor(LOOK_CONSTRUCTION_SITES)[0];
        if (!targetSite) {
            creep.say("No Site");
            return null;
        }
        return this.createBuildTask(targetSite.id);
    }

    createBuildTask(targetID) {
        const actionStack = [
            function (creep, buildTargetID) {
                const target = Game.getObjectById(buildTargetID);
                if (!target) {
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
        return new Task(base.buildTarget, "build", actionStack);
    }
}

module.exports = BuilderManager;
