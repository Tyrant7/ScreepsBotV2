const {
    INVADER_OWNER,
    SOURCE_KEEPER_OWNER,
    HATE_REMOTE_MULTIPLIER,
    HATE_KILL_THRESHOLD,
    MISSION_TYPES,
    MAX_ATTACK_ROOM_RANGE,
    DEFENSE_SCORE_TOWERS,
    DEFENSE_SCORE_DISTANCE,
} = require("./combat.missionConstants");
const {
    addHate,
    determineHateType,
    getAllPlayerData,
    createMission,
    getAllMissions,
    getColoniesInRange,
    getAllPlayerRooms,
    coolDown,
} = require("./combat.missionUtility");
const { roles } = require("./constants");
const Colony = require("./data.colony");

/**
 * The `MissionManager` will handle all top-level combat-related code
 * like handling hate and creating missions for who we want to eliminate.
 */
class MissionManager {
    /**
     * Accumulates hate for the enemies affecting this colony.
     * @param {Colony} colony
     */
    accumulateHate(colony) {
        for (const enemy of colony.enemies) {
            const player = enemy.owner.username;
            if (player === INVADER_OWNER || player === SOURCE_KEEPER_OWNER)
                continue;

            // Let's add the appropriate type of hate for this enemy
            addHate(player, determineHateType(enemy));
        }
        for (const enemy of colony.remoteEnemies) {
            const player = enemy.owner.username;
            if (player === INVADER_OWNER || player === SOURCE_KEEPER_OWNER)
                continue;

            // Include a multiplier for enemies in our remotes
            addHate(player, determineHateType(enemy) * HATE_REMOTE_MULTIPLIER);
        }
    }

    runGlobally() {
        const allPlayerData = getAllPlayerData();
        const sortedHate = Object.keys(allPlayerData).sort(
            (a, b) => allPlayerData[a].hate - allPlayerData[b].hate
        );
        while (sortedHate.length) {
            const mostHated = sortedHate.pop();
            if (allPlayerData[mostHated].hate < HATE_KILL_THRESHOLD) break;

            while (allPlayerData[mostHated].hate >= HATE_KILL_THRESHOLD) {
                const rankedRooms = this.rankRoomsToAttack(
                    getAllPlayerRooms(mostHated)
                );
                while (
                    rankedRooms.length &&
                    allPlayerData[mostHated].hate >= HATE_KILL_THRESHOLD
                ) {
                    const nextRoom = rankedRooms.pop();
                    const coloniesInRange = getColoniesInRange(
                        nextRoom,
                        MAX_ATTACK_ROOM_RANGE
                    );
                    if (!coloniesInRange.length) continue;
                    createMission(
                        nextRoom,
                        MISSION_TYPES.KILL,
                        coloniesInRange,
                        this.determineMilitaryNeeded(nextRoom)
                    );
                    coolDown(mostHated);
                }
            }
        }
    }

    rankRoomsToAttack(roomDatas) {
        const scores = {};
        for (const room in roomDatas) {
            const data = Memory.scoutData[room];

            // Score for each tower
            const towerScore = data.towers * DEFENSE_SCORE_TOWERS;

            // Then a penalty for each colony that's nearby, scaling the penalty the closer the colony is
            let distancePenalty = 0;
            for (const colony in Memory.colonies) {
                const roomDist = Game.map.findRoute(colony, room).length;
                distancePenalty +=
                    (MAX_ATTACK_ROOM_RANGE - roomDist + 1) *
                    DEFENSE_SCORE_DISTANCE;
            }
            scores[room] = towerScore - distancePenalty;
        }
        return Object.keys(roomDatas).sort((a, b) => scores[a] - scores[b]);
    }

    determineMilitaryNeeded(roomName) {
        const roomData = Memory.scoutData(roomName);

        // TODO //
        // Dynamic military sizes based on certain factors like towers and ramparts
        return {
            [roles.meleeDuo]: 1,
        };
    }
}

module.exports = MissionManager;
