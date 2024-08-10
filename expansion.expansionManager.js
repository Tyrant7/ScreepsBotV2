const { MISSION_TYPES } = require("./mission.missionConstants");
const {
    createMission,
    getAllMissionsOfType,
    getColoniesInRange,
    countMissionCreeps,
} = require("./mission.missionUtility");
const { roles, ROOM_SIZE } = require("./constants");
const { wrap } = require("./debug.profiler");
const {
    makeClaimer,
    makeColonizerBuilder,
    makeColonizerDefender,
} = require("./spawn.creepMaker");

class ExpansionManager {
    run() {
        wrap("expand", this.expandIfPossible);
    }

    expandIfPossible() {
        if (!hasFreeGCL()) return;

        // Validate that we actually have any data
        const d = Memory.scoutData;
        if (!Object.keys(d).length) return;

        // Let's find our best choice
        const best = Object.keys(d).reduce((best, curr) =>
            d[curr].expansionScore > d[best].expansionScore ? curr : best
        );

        // And create a mission for it
        createMission(
            best,
            MISSION_TYPES.COLONIZE,
            getColoniesInRange(best, CREEP_CLAIM_LIFE_TIME / ROOM_SIZE)
        );

        // After this, we'll clear all expansion scores since they're now out of date
        for (const room in Memory.scoutData) {
            delete Memory.scoutData[room].expansionScore;
        }

        if (DEBUG.logColonization) {
            console.log("Beginning colonization of room " + best);
        }
    }

    handleColony(colony) {
        // We'll add spawn requests for this colony for each expansion it is supporting
        const expansionMissions = getAllMissionsOfType(MISSION_TYPES.COLONIZE);
        for (const room of colony.memory.missions) {
            const expansion = expansionMissions[room];
            if (!expansion) continue;

            // Skip them if we can't afford the requests
            if (colony.room.energyCapacityAvailable < creepMaker.CLAIMER_COST)
                continue;

            if (countMissionCreeps(mission, roles.claimer) < 1) {
                colony.addSpawnRequest(
                    roles.claimer,
                    (colony, count) => makeClaimer(),
                    1
                );
            }
            if (countMissionCreeps(mission, roles.colonizerBuilder) < 2) {
                colony.addSpawnRequest(
                    roles.colonizerBuilder,
                    (colony, count) =>
                        makeColonizerBuilder(
                            colony.room.energyCapacityAvailable
                        ),
                    1
                );
            }
            if (countMissionCreeps(mission, roles.colonizerDefender) < 1) {
                colony.addSpawnRequest(
                    roles.colonizerDefender,
                    (colony, count) =>
                        makeColonizerDefender(
                            colony.room.energyCapacityAvailable
                        ),
                    1
                );
            }
        }
    }
}

const hasFreeGCL = () =>
    Object.keys(Memory.colonies).length +
        Object.keys(getAllMissionsOfType(MISSION_TYPES.COLONIZE)).length <
    Game.gcl.level;

module.exports = ExpansionManager;
