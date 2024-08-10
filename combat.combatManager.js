const {
    INVADER_OWNER,
    SOURCE_KEEPER_OWNER,
    HATE_REMOTE_MULTIPLIER,
    HATE_KILL_THRESHOLD,
    MAX_ATTACK_ROOM_RANGE,
    DEFENSE_SCORE_TOWERS,
    DEFENSE_SCORE_DISTANCE,
} = require("./combat.combatConstants");
const { MISSION_TYPES } = require("./mission.missionConstants");
const {
    addHate,
    determineHateType,
    getAllPlayerData,
    getAllPlayerRooms,
    coolDown,
} = require("./combat.combatUtility");
const {
    createMission,
    getColoniesInRange,
    getAllMissionsOfType,
    removeMission,
    getAllMissions,
} = require("./mission.missionUtility");
const { roles } = require("./constants");
const Colony = require("./data.colony");
const { getScoutingData } = require("./scouting.scoutingUtility");
const { makeDuoLeader, makeDuoFollower } = require("./spawn.creepMaker");

if (DEBUG.allowCommands) {
    require("./combat.combatCommands");
}

/**
 * The `CombatManager` will handle all top-level combat-related code
 * like handling hate and creating missions for who we want to eliminate.
 */
class CombatManager {
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

    run() {
        this.handleCombatMissions();
        this.createKillMissions();
    }

    handleCombatMissions() {
        const combatMissions = getAllMissionsOfType(MISSION_TYPES.KILL);
        for (const missionRoom in combatMissions) {
            if (this.isCombatComplete(missionRoom)) {
                removeMission(missionRoom);
                continue;
            }

            // Add spawn requests
            const mission = getAllMissions()[missionRoom];
            const existingDuos = mission.creepNamesAndRoles.filter(
                (c) => c.role === roles.combatDuo
            );
            const leaders = existingDuos.filter(
                (d) => Game.creeps[d.name].memory.superior
            ).length;
            const followers = existingDuos.length - leaders;

            // Five parts to tank for each tower
            const roomData = getScoutingData(missionRoom);
            const parts = Math.max(roomData.towers, 1) * 5;

            // If we have more leaders than followers, let's make a follower, otherwise, let's make a leader
            // This ensures that our duos will spawn in pairs
            return leaders > followers ||
                // Also don't allow us to spawn our follower and leader in a different room
                !colony.combatDuos.find((c) => c.memory.superior)
                ? makeDuoFollower(parts)
                : makeDuoLeader(parts, WORK);
        }
    }

    isCombatComplete(missionRoom) {
        // Combat is completed when all spawns are destroyed
        return (
            Game.rooms[missionRoom] &&
            !Game.rooms[missionRoom]
                .find(FIND_HOSTILE_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_SPAWN)
        );
    }

    createKillMissions() {
        const allPlayerData = getAllPlayerData();
        const allMissions = getAllMissions();
        const sortedHate = Object.keys(allPlayerData).sort(
            (a, b) => allPlayerData[a].hate - allPlayerData[b].hate
        );
        while (sortedHate.length) {
            const mostHated = sortedHate.pop();
            if (allPlayerData[mostHated].hate < HATE_KILL_THRESHOLD) break;

            const rankedRooms = this.rankRoomsToAttack(
                getAllPlayerRooms(mostHated)
            );
            while (
                allPlayerData[mostHated].hate >= HATE_KILL_THRESHOLD &&
                rankedRooms.length
            ) {
                const nextRoom = rankedRooms.pop();
                if (allMissions[nextRoom]) continue;
                const coloniesInRange = getColoniesInRange(
                    nextRoom,
                    MAX_ATTACK_ROOM_RANGE
                );
                if (!coloniesInRange.length) continue;
                createMission(nextRoom, MISSION_TYPES.KILL, coloniesInRange);
                coolDown(mostHated);
            }
        }
    }

    rankRoomsToAttack(roomDatas) {
        const scores = {};
        for (const room in roomDatas) {
            const data = getScoutingData(room);

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
}

module.exports = CombatManager;
