const CreepManager = require("creepManager");
const Task = require("task");
const scoutingUtility = require("scoutingUtility");

class ScoutManager extends CreepManager {

    createTask(creep, roomInfo) {

        // Let's generate a new 'explore' task for the closest room within an arbitrary range to the creep's current room
        const targetName = scoutingUtility.searchForUnexploredRoomsNearby(creep.room.name, 3) 
            // If we've explored all directions, just go somewhere random
            // TODO //
            // Make this better
            || Object.values(Game.map.describeExits(creep.room.name))[0];
        const actionStack = [];
        actionStack.push(function(creep, data) {

            // We should only update data when leaving or entering a room to be efficient with CPU
            const leavingOrEntering = creep.pos.x >= 49 ||
                                      creep.pos.x <= 0  ||
                                      creep.pos.y >= 49 ||
                                      creep.pos.y <= 0;

            // We've hit our target room -> we can request a new task!
            if (creep.room.name === data.roomName && !leavingOrEntering) {
                return true;
            }
            else {
                data.maxRooms = 3;
                this.basicActions.moveToRoom(creep, data);
                creep.say("🔭", true);
            }


            // Update room data if needed
            let roomData = Memory.rooms[creep.room.name];

            // These things only need to be recorded once since they never change
            if (!roomData) {
                roomData = { lastVisit: Game.time };

                // The controller position
                const controller = creep.room.controller;
                if (controller) {
                    roomData.controller = {};
                    roomData.controller.pos = { x: controller.pos.x, y: controller.pos.y };
                    roomData.controller.id = controller.id;
                }

                // Source positions
                roomData.sources = [];
                const sources = creep.room.find(FIND_SOURCES);
                sources.forEach((source) => roomData.sources.push({ pos: { x: source.pos.x, y: source.pos.y }, id: source.id }));

                // Mineral position, if one exists
                roomData.minerals = [];
                const minerals = creep.room.find(FIND_MINERALS);
                minerals.forEach((mineral) => roomData.minerals.push(
                    { pos: { x: mineral.pos.x, y: mineral.pos.y }, density: mineral.density, type: mineral.mineralType, id: mineral.id }));
            }

            // These things change, so let's record them every time
            if (leavingOrEntering) {
                roomData.lastVisit = Game.time;

                // Update controller information
                if (roomData.controller && roomData.controller.owner) {
                    const controllerObject = Game.getObjectById(roomData.controller.id);
                    roomData.controller.owner = controllerObject.owner.username;
                    roomData.controller.level = controllerObject.level;
                }

                // Update minerals
                roomData.minerals.forEach((mineral) => {
                    const gameObject = Game.getObjectById(mineral.id);
                    mineral.density = gameObject.density;
                    mineral.type = gameObject.type;
                });

                // If there are invaders in this room, record the amount and current tick
                const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
                for (const hostile of hostiles) {
                    if (hostile.owner.username === "Source Keeper") {
                        if (!roomData.sourceKeepers) {
                            roomData.sourceKeepers = [];
                        }
                        roomData.sourceKeepers.push(hostile.name);
                    }
                    else if (hostile.owner.username === "Invader") {
                        if (!roomData.invaders) {
                            roomData.invaders = [];
                        }
                        roomData.invaders.push(hostile.name);
                    }
                }

                // Record invader structures as well
                const invaderCores = creep.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE });
                if (invaderCores.length) {
                    roomData.invaderCores = invaderCores.map(function(core) {
                        return { x: core.pos.x, y: core.pos.y, level: core.level };
                    });
                }

                // And keeper lairs
                const keeperLairs = creep.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR });
                if (keeperLairs.length) {
                    roomData.keeperLairs = keeperLairs.map(function(lair) {
                        return { x: lair.pos.x, y: lair.pos.y };
                    });
                }

                // Commit findings to memory!
                Memory.rooms[creep.room.name] = roomData;
            }
        });

        return new Task({ roomName: targetName }, "explore", actionStack);
    }
}

module.exports = ScoutManager;