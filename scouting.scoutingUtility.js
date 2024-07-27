const { SK_PATHING_COST, pathSets } = require("./constants");
const { cachePathMatrix } = require("./extension.betterPathing");

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

    // If this room is an SK room, we'll update our "travel" pathset to avoid the keeper patrol points
    // We'll also mark down the pointer so we know where they are next time
    if (roomData.keeperLairs.length) {
        roomData.keeperPositions = room
            .find(FIND_HOSTILE_CREEPS)
            .filter((c) => c.owner.username === "Source Keeper")
            .map((c) => c.pos);

        const matrix = createSKMatrix(roomData.keeperPositions);
        cachePathMatrix(matrix, pathSets.travel, room.name);
    }

    return roomData;
};

const getScoutingData = (roomName) => {
    return Memory.scoutData[roomName];
};

const setScoutingData = (roomName, newData) => {
    Memory.scoutData[roomName] = newData;
};

const createSKMatrix = (avoidPositions) => {
    const newMatrix = new PathFinder.CostMatrix();
    for (const pos of avoidPositions) {
        for (let x = pos.x - 3; x <= pos.x + 3; x++) {
            for (let y = pos.y - 3; y <= pos.y + 3; y++) {
                if (x < 0 || x > 49 || y < 0 || y > 49) {
                    continue;
                }
                newMatrix.set(x, y, SK_PATHING_COST);
            }
        }
    }
    return newMatrix;
};

const restoreSKMatrices = () => {
    for (const room in Memory.scoutData) {
        if (Memory.scoutData[room].keeperPositions) {
            cachePathMatrix(
                createSKMatrix(Memory.scoutData[room].keeperPositions),
                pathSets.travel,
                room
            );
        }
    }
};

module.exports = {
    searchForUnexploredRoomsNearby,
    packageScoutingData,
    getScoutingData,
    setScoutingData,
    restoreSKMatrices,
};
