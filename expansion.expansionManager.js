const { MISSION_TYPES } = require("./combat.missionConstants");
const {
    createMission,
    getAllMissionsOfType,
    getColoniesInRange,
} = require("./combat.missionUtility");
const { roles, ROOM_SIZE } = require("./constants");
const { wrap } = require("./debug.profiler");

class ExpansionManager {
    run() {
        wrap("expand", this.expandIfPossible);
        wrap("handle", this.handleExpansions);
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

        // And create an entry for it in our global colonization spot
        createMission(
            best,
            MISSION_TYPES.COLONIZE,
            getColoniesInRange(best, CREEP_CLAIM_LIFE_TIME / ROOM_SIZE),
            {
                [roles.claimer]: 1,
                [roles.colonizerBuilder]: 2,
                [roles.colonizerDefender]: 1,
            }
        );

        // After this, we'll clear all expansion scores since they're now out of date
        for (const room in Memory.scoutData) {
            delete Memory.scoutData[room].expansionScore;
        }

        if (DEBUG.logColonization) {
            console.log("Beginning colonization of room " + best);
        }
    }

    handleExpansions() {
        // Make sure our expansion colonies are aware of their own creeps for spawn tracking
        const expansionMissions = getAllMissionsOfType(MISSION_TYPES.COLONIZE);
        for (const expansion in expansionMissions) {
            // Filter out the creeps that we think we own to only include creeps that are still alive
            expansionMissions[expansion].creepNamesAndRoles = expansionMissions[
                expansion
            ].creepNamesAndRoles.filter((c) => Game.creeps[c.name]);

            // If we've claimed this room, we can remove the claimer from its spawn demand
            expansionMissions[expansion].spawnDemands[roles.claimer] =
                Game.rooms[expansion] && Game.rooms[expansion].controller.my
                    ? 0
                    : 1;
        }
    }
}

const hasFreeGCL = () =>
    Object.keys(Memory.colonies).length +
        Object.keys(getAllMissionsOfType(MISSION_TYPES.COLONIZE)).length <
    Game.gcl.level;

module.exports = ExpansionManager;
