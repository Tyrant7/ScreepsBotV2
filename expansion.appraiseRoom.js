const { getPotentialRemoteRooms } = require("./remote.remoteUtility");

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

    let score = 0;
    for (const layer of Object.values(appraisalLayers)) {
        score += layer.go(scoutingData) * layer.WEIGHT;
    }

    console.log(score);
    return score;
};

module.exports = appraiseRoom;
