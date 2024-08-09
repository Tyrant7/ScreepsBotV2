const getAllMissions = () => {
    return Memory.missions;
};

const getAllMissionsOfType = (type) => {
    return _.pick(Memory.missions, (m) => m.type === type);
};

const getMissionType = (roomName) => {
    if (!Memory.missions[roomName]) return 0;
    return Memory.missions[roomName].type;
};

const createMission = (roomName, type, supporters, spawnRequests) => {
    for (const supporter of supporters) {
        if (!Memory.colonies[supporter].missions) {
            Memory.colonies[supporter].missions = [];
        }
        if (!Memory.colonies[supporter].missions.includes(roomName)) {
            Memory.colonies[supporter].missions.push(roomName);
        }
    }

    console.log("creating: " + roomName);

    Memory.missions[roomName] = {
        type,
        created: Game.time,
        supporters,
        spawnRequests,
        creepNamesAndRoles: [],
    };
};

const removeMission = (roomName) => {
    console.log("removing: " + roomName);

    for (const supporter of Memory.missions[roomName].supporters) {
        Memory.colonies[supporter].missions = Memory.colonies[
            supporter
        ].missions.filter((m) => m !== roomName);
    }
    delete Memory.missions[roomName];
};

const getColoniesInRange = (point, maxDist, minRCL = 0) => {
    const supporters = [];
    for (const colony in Memory.colonies) {
        if (Memory.colonies[colony].rcl < minRCL) continue;
        const route = Game.map.findRoute(colony, point);
        if (route.length <= maxDist) {
            supporters.push(colony);
        }
    }
    return supporters;
};

module.exports = {
    getAllMissions,
    getAllMissionsOfType,
    getMissionType,
    createMission,
    removeMission,
    getColoniesInRange,
};
