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
        go: (data, roomName, remotes) => data.sources.length - 1,
    },
    {
        DEBUG_NAME: "remoteDistances",
        WEIGHT: 1.5,
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
            paths.sort((a, b) => b - a);
            const MAX_REMOTE_DIST = ROOM_SIZE * 2;

            // Now we have all of our distances sorted by closest first
            // we'll consider each source as worth more than the previous
            // since we're far more likely to sustain closer sources for remotes
            let score = 0;
            for (let i = paths.length; i > 0; i--) {
                // Distance with exponential falloff
                const dist = Math.sqrt(
                    MAX_REMOTE_DIST -
                        Math.min(paths[i - 1], MAX_REMOTE_DIST - 1)
                );

                // 0.5 - 1 range of weight depending on ranking of source
                const weight = (i / paths.length) * 0.5 + 0.5;
                score += weight * dist;
            }
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
            const BEST_DIST = 8;
            const MAX_DIST = CREEP_CLAIM_LIFE_TIME / ROOM_SIZE;

            const roomWorldPos = roomNameToXY(roomName);
            let sumDist = 0;
            for (const key in Memory.colonies) {
                const colonyPos = roomNameToXY(key);
                const diffX = Math.abs(colonyPos.xx - roomWorldPos.xx);
                const diffY = Math.abs(colonyPos.yy - roomWorldPos.yy);
                const linearDist = diffX + diffY;

                if (linearDist < MIN_DIST || linearDist > MAX_DIST) {
                    // Shouldn't take this room,
                    // either too close and will cause interference with existing rooms
                    // or too far and won't be able to reach it
                    return -Infinity;
                }
                // We'll apply a small penalty for going further away than our max
                const weightedDist =
                    linearDist > BEST_DIST
                        ? BEST_DIST - linearDist
                        : linearDist;
                sumDist += weightedDist;
            }

            // Otherwise, a sum of distances is a good way to encourage spreading rooms out
            return sumDist;
        },
    },
    {
        DEBUG_NAME: "mineral",
        WEIGHT: 50,
        go: (data, roomName, remotes) => {
            // First, we'll count up all of our minerals that we have already
            const mineralCounts = {};
            for (const colony in Memory.colonies) {
                const colonyData = getScoutingData(colony);
                if (!colonyData) continue;
                if (!colonyData.minerals) continue;
                for (const mineral of colonyData.minerals) {
                    mineralCounts[mineral.type] =
                        (mineralCounts[mineral.type] || 0) + 1;
                }
            }

            // If this room has the mineral we have the least of
            // (checking against either none or matching the lowest value)
            // then we'll give it a bonus, otherwise no bonus is warranted,
            // since we don't particularly need this mineral
            return data.minerals.find(
                (m) =>
                    !mineralCounts[m] ||
                    mineralCounts[m] === _.min(Object.values(mineralCounts))
            )
                ? 1
                : 0;
        },
    },
];

const appraiseRoom = (scoutingData, roomName) => {
    if (!scoutingData.controller) {
        return 0;
    }

    if (
        scoutingData.controller.owner &&
        scoutingData.controller.owner.username === ME
    ) {
        return 0;
    }

    // Let's ensure that all possible remotes have been scouted
    const allRemotes = getPotentialRemoteRooms(roomName, (rn) => true);
    const scoutedRemotes = getPotentialRemoteRooms(roomName, (rn) =>
        getScoutingData(rn)
    );
    if (allRemotes.length !== scoutedRemotes.length) {
        return 0;
    }

    const BAR = "-".repeat(8);
    const logDebugMessage = (message, useBars = false) => {
        if (!DEBUG.logAppraisal) return;
        if (useBars) {
            console.log(`${BAR} ${message} ${BAR}`);
            return;
        }
        console.log(message);
    };

    logDebugMessage(`Appraising room ${roomName}`, true);
    let score = 0;
    for (const layer of appraisalLayers) {
        logDebugMessage(`Running layer: ${layer.DEBUG_NAME}`);

        const layerRawScore = layer.go(scoutingData, roomName, scoutedRemotes);
        const layerScore = layerRawScore * layer.WEIGHT;
        score += layerScore;

        logDebugMessage(`Raw score: ${layerRawScore}`);
        logDebugMessage(`Weighted score: ${layerScore}`);
    }

    logDebugMessage(`Total score: ${score}`, true);
    return score;
};

global.COMMAND_APPRAISE_ROOM = () =>
    appraiseRoom(getScoutingData("W2N2"), "W2N2");

module.exports = appraiseRoom;
