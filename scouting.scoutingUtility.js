/**
 * Performs a breadth-first search of neighbouring rooms until an unexplored room has been found.
 * @param {string} startRoomName The name of the room to start in.
 * @param {number} maxDepth The max iterations to search for. After this, null will be returned.
 * @returns {string} The name of the first unexplored room found.
 */
const searchForUnexploredRoomsNearby = (startRoomName, maxDepth) => {
    let current = Object.values(Game.map.describeExits(startRoomName));
    for (let i = 0; i < maxDepth; i++) {
        let next = [];
        for (const room of current) {
            if (!Memory.scoutData[room]) {
                return room;
            }
            next.push(...Object.values(Game.map.describeExits(room)));
        }
        current = next;
    }

    // None found before maxDepth expired
    return null;
};

const packageScoutingData = (room) => {
    const recordPosAndID = (structure) => {
        return {
            pos: {
                x: structure.pos.x,
                y: structure.pos.y,
            },
            id: structure.id,
        };
    };

    const roomData = getScoutingData(room.name) || {};

    // Record some important scouting data
    roomData.lastVisit = Game.time;

    if (room.controller) {
        roomData.controller = recordPosAndID(room.controller);
        if (room.controller.owner) {
            roomData.controller.owner = room.controller.owner.username;
            roomData.controller.level = room.controller.level;
        }
    }

    roomData.sources = room
        .find(FIND_SOURCES)
        .map((source) => recordPosAndID(source));

    roomData.minerals = room.find(FIND_MINERALS).map((mineral) => {
        const info = recordPosAndID(mineral);
        info.density = mineral.density;
        info.type = mineral.mineralType;
        return info;
    });

    roomData.invaderCores = [];
    roomData.keeperLairs = [];
    for (const structure of room.find(FIND_STRUCTURES)) {
        if (structure.structureType === STRUCTURE_INVADER_CORE) {
            roomData.invaderCores.push({
                x: structure.pos.x,
                y: structure.pos.y,
            });
        } else if (structure.structureType === STRUCTURE_KEEPER_LAIR) {
            roomData.keeperLairs.push({
                x: structure.pos.x,
                y: structure.pos.y,
            });
        }
    }
    return roomData;
};

const getScoutingData = (roomName) => {
    return Memory.scoutData[roomName];
};

const setScoutingData = (roomName, newData) => {
    Memory.scoutData[roomName] = newData;
};

// Function to convert room name to coords taken from Screeps Engine
const roomNameToXY = (name) => {
    let xx = parseInt(name.substr(1), 10);
    let verticalPos = 2;
    if (xx >= 100) {
        verticalPos = 4;
    } else if (xx >= 10) {
        verticalPos = 3;
    }
    let yy = parseInt(name.substr(verticalPos + 1), 10);
    let horizontalDir = name.charAt(0);
    let verticalDir = name.charAt(verticalPos);
    if (horizontalDir === "W" || horizontalDir === "w") {
        xx = -xx - 1;
    }
    if (verticalDir === "N" || verticalDir === "n") {
        yy = -yy - 1;
    }
    return { xx, yy };
};

module.exports = {
    searchForUnexploredRoomsNearby,
    packageScoutingData,
    getScoutingData,
    setScoutingData,
    roomNameToXY,
};
