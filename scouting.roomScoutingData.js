const { getScoutingData } = require("./scouting.scoutingUtility");

const recordPosAndID = (structure) => {
    return {
        pos: {
            x: structure.pos.x,
            y: structure.pos.y,
        },
        id: structure.id,
    };
};

class RoomScoutingData {
    constructor(room) {
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
            info.type = mineral.type;
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
    }
}

module.exports = RoomScoutingData;
