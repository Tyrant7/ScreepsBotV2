const MAX_VALUE = 255;
const MIN_BUILD_AREA = 5;
const MAX_BUILD_AREA = 44;

const EXCLUSION_ZONE = "exclusion";

// Numbers are in order of priority
// When two structures are attempted to be placed on the same tile,
// the higher number will take precedence
const structureToNumber = {
    [STRUCTURE_SPAWN]: 10,
    [STRUCTURE_EXTENSION]: 5,
    [STRUCTURE_ROAD]: 2,
    [STRUCTURE_LINK]: 20,
    [STRUCTURE_STORAGE]: 99,
    [STRUCTURE_TOWER]: 4,
    [STRUCTURE_OBSERVER]: 71,
    [STRUCTURE_POWER_SPAWN]: 61,
    [STRUCTURE_EXTRACTOR]: 51,
    [STRUCTURE_LAB]: 6,
    [STRUCTURE_TERMINAL]: 81,
    [STRUCTURE_CONTAINER]: 3,
    [STRUCTURE_NUKER]: 91,
    [STRUCTURE_FACTORY]: 41,
    [EXCLUSION_ZONE]: 1,
};

const numberToStructure = _.invert(structureToNumber);

const MAX_STRUCTURES = {};
for (const key in CONTROLLER_STRUCTURES) {
    MAX_STRUCTURES[key] = parseInt(
        Object.values(CONTROLLER_STRUCTURES[key]).slice(-1)
    );
}

module.exports = {
    MAX_VALUE,
    MIN_BUILD_AREA,
    MAX_BUILD_AREA,
    EXCLUSION_ZONE,
    structureToNumber,
    numberToStructure,
    MAX_STRUCTURES,
};
