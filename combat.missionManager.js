const {
    INVADER_OWNER,
    SOURCE_KEEPER_OWNER,
    HATE_REMOTE_MULTIPLIER,
    HATE_KILL_THRESHOLD,
    MISSION_TYPES,
    MAX_MISSIONS,
} = require("./combat.missionConstants");
const {
    addHate,
    determineHateType,
    getAllPlayerData,
    createMission,
    getAllMissions,
} = require("./combat.missionUtility");
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
        const existingMissions = getAllMissions();
        while (Object.keys(existingMissions).length < MAX_MISSIONS) {
            const mostHated = sortedHate.pop();
            if (allPlayerData[mostHated].hate < HATE_KILL_THRESHOLD) break;

            // Find a room to kill
        }
    }
}

module.exports = MissionManager;
