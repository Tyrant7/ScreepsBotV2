const { ROOM_SIZE } = require("./constants");
const { getPotentialRemoteRooms } = require("./remote.remoteUtility");
const { getScoutingData, roomNameToXY } = require("./scouting.scoutingUtility");

/**
 * When appraising rooms, we'll consider a variety of things.
 * Each layer represents a unique thing that we'll consider when
 * appraising a room.
 * Each layer will return a score, which will be weighted according to the constants
 * associted with each layer.
 */
const appraisalLayers = {
    sourceCount: {
        WEIGHT: 100,
        go: (data, roomName, remotes) => data.sources.length,
    },
    remoteDistances: {
        WEIGHT: 1,
        go: (data, roomName, remotes) => {
            // Let's draw some distances to all remote sources and sort by distance
            const paths = [];
            for (const remote of remotes) {
                for (const source of getScoutingData(remote).sources) {
                    // We're interested in the raw path distance to get to each source
                    const result = PathFinder.search(
                        new RoomPosition(source.pos.x, source.pos.y, remote),
                        {
                            pos: new RoomPosition(25, 25, roomName),
                            range: 23,
                        },
                        {
                            plainCost: 1,
                            swampCost: 1,
                        }
                    );
                    if (result.incomplete) continue;
                    paths.push(result.path.length);
                }
            }
            paths.sort();
            const MAX_REMOTE_DIST = ROOM_SIZE * 2;

            // Now we have all of our distances sorted
            // we'll consider each source as worth more than the previous
            // since we're far more likely to sustain closer sources for remotes
            let score = 0;
            for (let i = paths.length; i > 0; i--) {
                const dist = Math.sqrt(MAX_REMOTE_DIST - paths[i - 1]);
                score += i * dist;

                console.log(i * dist);
            }
            console.log(score);
            return score;
        },
    },
};

const appraiseRoom = (scoutingData, roomName) => {
    console.log("appraising: " + roomName);
    if (!scoutingData.controller) {
        console.log("no controller");
        return 0;
    }

    // Let's ensure that all possible remotes have been scouted
    const allRemotes = getPotentialRemoteRooms(roomName, (roomName) => true);
    const scoutedRemotes = getPotentialRemoteRooms(roomName, (roomName) =>
        getScoutingData(roomName)
    );
    if (allRemotes.length !== scoutedRemotes.length) {
        console.log("not all remotes scouted!");
        return 0;
    }

    for (const remote of scoutedRemotes) {
        console.log(remote);
    }

    let score = 0;
    for (const layer of Object.values(appraisalLayers)) {
        score +=
            layer.go(scoutingData, roomName, scoutedRemotes) * layer.WEIGHT;
    }

    console.log(score);
    return score;
};

module.exports = appraiseRoom;
