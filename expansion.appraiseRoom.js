const { getPotentialRemoteRooms } = require("./remote.remoteUtility");

// Remotes are taken from a manhatten distance of 2 rooms,
// so any given source cannot be further than 2 * ROOM_WIDTH + ROOM_WIDTH / 2
// from our target
const MAX_REMOTE_DIST = 125;

/**
 * When appraising rooms, we'll consider a variety of things.
 * Each layer represents a unique thing that we'll consider when
 * appraising a room.
 * Each layer will return a score, which will be weighted according to the constants
 * associted with each layer.
 */
const appraisalLayers = {
    sourceCount: { WEIGHT: 100, go: (data) => data.sources.length },
};

const appraiseRoom = (scoutingData, roomName) => {
    console.log("appraising: " + roomName);
    if (!scoutingData.controller) {
        return 0;
    }

    const remotes = getPotentialRemoteRooms(roomName, false);
    console.log(remotes.length);
    for (const remote of remotes) {
        console.log(remote);
    }

    let score = 0;
    for (const layer of Object.values(appraisalLayers)) {
        score += layer.go(scoutingData) * layer.WEIGHT;
    }

    console.log(score);
    return score;
};

module.exports = appraiseRoom;
