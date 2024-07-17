const CreepManager = require("./manager.creepManager");
const Task = require("./data.task");
const RoomScoutingData = require("./scouting.roomScoutingData");
const scoutingUtility = require("./scouting.scoutingUtility");

class ScoutManager extends CreepManager {
    createTask(creep, colony) {
        // Let's generate a new 'explore' task for the closest room within an arbitrary range to the creep's current room
        const targetName =
            scoutingUtility.searchForUnexploredRoomsNearby(
                creep.room.name,
                3
            ) ||
            // If we've explored all directions, just go somewhere random
            // TODO //
            // Make this better
            Object.values(Game.map.describeExits(creep.room.name))[0];
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
                data.maxRooms = 16;
                data.maxOps = 4500;
                data.moveToRoom(creep, data);
                creep.say("🔭", true);
            }

            if (leavingOrEntering) {
                const roomData = new RoomScoutingData(creep.room);
                scoutingUtility.setScoutingData(roomData);
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
