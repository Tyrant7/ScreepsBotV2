const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const {
    searchForUnexploredRoomsNearby,
    packageScoutingData,
    setScoutingData,
} = require("./scouting.scoutingUtility");
const appraiseRoom = require("expansion.appraiseRoom");
const { pathSets } = require("./constants");

class ScoutManager extends CreepManager {
    createTask(creep, colony) {
        // Let's generate a new 'explore' task for the closest room within an arbitrary range to the creep's current room
        const targetName =
            // We should always explore our immediate neighbours first
            searchForUnexploredRoomsNearby(colony.room.name, 1) ||
            // Then nearby to ourselves
            searchForUnexploredRoomsNearby(creep.room.name, 3) ||
            // If we've explored all directions of our current room, go off our base room
            searchForUnexploredRoomsNearby(colony.room.name, 3) ||
            // If all fails, let's go somewhere random
            _.sample(Object.values(Game.map.describeExits(creep.room.name)));

        const actionStack = [];
        actionStack.push(function (creep, data) {
            // We should only update data when leaving or entering a room to be efficient with CPU
            const leavingOrEntering =
                creep.pos.x >= 49 ||
                creep.pos.x <= 0 ||
                creep.pos.y >= 49 ||
                creep.pos.y <= 0;

            // We've hit our target room -> we can request a new task!
            if (creep.room.name === data.roomName && !leavingOrEntering) {
                return true;
            } else {
                data.maxRooms = 32;
                data.maxOps = 16384;
                data.pathSet = pathSets.travel;
                data.moveToRoom(creep, data);
                creep.say("🔭", true);
            }

            if (leavingOrEntering) {
                const scoutingData = packageScoutingData(creep.room);
                scoutingData.expansionScore = appraiseRoom(
                    scoutingData,
                    creep.room.name
                );
                setScoutingData(creep.room.name, scoutingData);
            }
        });

        return new Task(
            { moveToRoom: this.basicActions.moveToRoom, roomName: targetName },
            "explore",
            actionStack
        );
    }
}

module.exports = ScoutManager;
