const Task = require("task");

class ScoutTaskGenerator {

    run(creep, roomInfo, activeTasks) {

        // Let's generate a new 'explore' task for the closest room within an arbitrary range to the creep's current room
        const targetName = this.searchForUnexploredRoomsNearby(creep.room.name, 8);
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
                }

                // Source positions
                roomData.sourcePositions = [];
                const sources = creep.room.find(FIND_SOURCES);
                sources.forEach((source) => roomData.sourcePositions.push({ x: source.pos.x, y: source.pos.y }));

                // Mineral position, if one exists
                roomData.mineralPositions = [];
                const minerals = creep.room.find(FIND_MINERALS);
                minerals.forEach((mineral) => roomData.mineralPositions.push(
                    { x: mineral.pos.x, y: mineral.pos.y, density: mineral.density, type: mineral.mineralType }));

                // If this room is owned by somebody else,
                // Record the owner's username and controller level
                if (controller && controller.owner && !controller.my) {
                    roomData.controller.owner = controller.owner.username;
                    roomData.controller.level = controller.level;
                }

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
                    roomData.invaderCores = [];
                    roomData.invaderCores = invaderCores.map(function(core) {
                        return { x: core.pos.x, y: core.pos.y, level: core.level };
                    });
                }

                // And keeper lairs
                const keeperLairs = creep.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR });
                if (keeperLairs.length) {
                    roomData.keeperLairs = [];
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

    /**
     * Performs a breadth-first search of neighbouring rooms until an unexplored room has been found.
     * @param {string} startingRoom The name of the room to start in.
     * @param {number} maxIterations The max iterations to search for. After this, whatever room in is currently looking at will be returned.
     * @returns 
     */
    searchForUnexploredRoomsNearby(startingRoom, maxIterations) {

        // Perform a breadth-first search of neighbouring rooms
        // If all of them have been explored, repeat with their neighbours
        // Continue until an unexplored room has been found
        let current = Object.values(Game.map.describeExits(startingRoom));
        for (let i = 0; i < maxIterations; i++) {
            let next = [];
            for (const room of current) {
                if (!Memory.rooms[room]) {
                    return room;
                }
                next.push(...Object.values(Game.map.describeExits(room)));
            }
            current = next;
        }

        // None found before maxIterations expired, let's just return whatever one 
        // we looked at first during our last iteration
        return current[0];
    }
}

module.exports = ScoutTaskGenerator;