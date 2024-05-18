const { MAX_BUILD_AREA, MIN_BUILD_AREA } = require("./base.planningConstants");

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
