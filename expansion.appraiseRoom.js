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
const appraisalLayers = [
    {
        DEBUG_NAME: "sourceCount",
        WEIGHT: 100,
        go: (data, roomName, remotes) => data.sources.length,
    },
    {
        DEBUG_NAME: "remoteDistances",
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
    {
        DEBUG_NAME: "baseDistance",
        WEIGHT: 3,
        go: (data, roomName, remotes) => {
            // Remoting distance -> don't want to end up sharing remotes
            const MIN_DIST = 4;

            // Arbitrary for now
            const MAX_DIST = 8;

            const roomWorldPos = roomNameToXY(roomName);
            let sumDist = 0;
            for (const key in Memory.colonies) {
                const colonyPos = roomNameToXY(key);
                const diffX = Math.abs(colonyPos.xx - roomWorldPos.xx);
                const diffY = Math.abs(colonyPos.yy - roomWorldPos.yy);
                const linearDist = Math.min(diffX, diffY);
                if (linearDist < MIN_DIST || linearDist > MAX_DIST) {
                    // Shouldn't take this room
                    return -Infinity;
                }
                sumDist += linearDist;
            }

            // Otherwise, a sum of distances is a good way to encourage spreading rooms out
            return sumDist;
        },
    },
];

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
    for (const layer of appraisalLayers) {
        const layerRawScore = layer.go(scoutingData, roomName, scoutedRemotes);
        const layerScore = layerRawScore * layer.WEIGHT;
        score += layerScore;

        console.log(layer.DEBUG_NAME);
        console.log("Raw score: " + layerRawScore);
        console.log("Weighted score: " + layerScore);
    }

    console.log("Total score: ");
    console.log(score);
    return score;
};

module.exports = appraiseRoom;
