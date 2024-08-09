const { ROOM_SIZE } = require("./constants");

const ALLIES = [];

const COOLDOWN_AMOUNT = 5000;

const HATE_FOR_SCOUT = 1;
const HATE_FOR_THIEF = 2;
const HATE_FOR_ATTACKER = 35;

const HATE_REMOTE_MULTIPLIER = 0.4;

const SOURCE_KEEPER_OWNER = "Source Keeper";
const INVADER_OWNER = "Invader";

const HATE_KILL_THRESHOLD = 4000;

/**
 * Creeps must be able to reach their destination within half of a typical lifetime.
 */
const MAX_ATTACK_ROOM_RANGE = CREEP_LIFE_TIME / ROOM_SIZE / 2;

const DEFENSE_SCORE_TOWERS = 10;
const DEFENSE_SCORE_DISTANCE = 2;

module.exports = {
    ALLIES,
    COOLDOWN_AMOUNT,
    HATE_FOR_SCOUT,
    HATE_FOR_THIEF,
    HATE_FOR_ATTACKER,
    HATE_REMOTE_MULTIPLIER,
    SOURCE_KEEPER_OWNER,
    INVADER_OWNER,
    HATE_KILL_THRESHOLD,
    MAX_ATTACK_ROOM_RANGE,
    DEFENSE_SCORE_TOWERS,
    DEFENSE_SCORE_DISTANCE,
};
