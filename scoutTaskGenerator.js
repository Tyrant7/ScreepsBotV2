const Task = require("task");
const scoutingUtility = require("scoutingUtility");

class ScoutTaskGenerator {

    run(creep, roomInfo, activeTasks) {

        // If for some reason our room data has been cleared, start by exploring 
        // the room we're in already to avoid throwing an error
        const targetName = !Memory.rooms[creep.room.name] ? creep.room.name :

            // Let's generate a new 'explore' task for the closest room within an arbitrary range to the creep's current room
            scoutingUtility.searchForUnexploredRoomsNearby(creep.room.name, 6) 
            // If we've explored all directions, just go somewhere random
            // TODO //
            // Make this better
            || Object.values(Game.map.describeExits(creep.room.name))[0];
        const actionStack = [];
        actionStack.push(function(creep, target) {

            // We should only update data when leaving or entering a room to be efficient with CPU
            const leavingOrEntering = creep.pos.x >= 49 ||
                                      creep.pos.x <= 0  ||
                                      creep.pos.y >= 49 ||
                                      creep.pos.y <= 0;

            // We've hit our target room -> we can request a new task!
            if (creep.room.name === target && !leavingOrEntering) {
                return true;
            }
            else {
                // Simpler to pathfind to the direct centre of our target
                creep.moveTo(new RoomPosition(25, 25, target));
                creep.say("🔭", true);
            }


            // Update room data if needed
            let roomData = Memory.rooms[creep.room.name];
            if (!roomData || leavingOrEntering) {
                roomData = { lastVisit: Game.time };

                // The controller position
                const controller = creep.room.controller;
                if (controller) {
                    roomData.controller = {};
                    roomData.controller.pos = { x: controller.pos.x, y: controller.pos.y };
                    roomData.controller.id = controller.id;

                    // If this room is owned by somebody else,
                    // Record the owner's username and controller level
                    if (controller.owner && !controller.my) {
                        roomData.controller.owner = controller.owner.username;
                        roomData.controller.level = controller.level;
                    }
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

        return [new Task(targetName, "explore", actionStack)];
    }
}

module.exports = ScoutTaskGenerator;