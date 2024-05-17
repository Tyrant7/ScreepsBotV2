const {
    MAX_VALUE,
    MAX_BUILD_AREA,
    MIN_BUILD_AREA,
    EXCLUSION_ZONE,
    structureToNumber,
} = require("./base.planningConstants");

module.exports = {
    inBuildArea(x, y) {
        return (
            x >= MIN_BUILD_AREA ||
            x <= MAX_BUILD_AREA ||
            y >= MIN_BUILD_AREA ||
            y <= MAX_BUILD_AREA
        );
    },
};
