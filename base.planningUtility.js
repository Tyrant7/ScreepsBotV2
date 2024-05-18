const { MAX_BUILD_AREA, MIN_BUILD_AREA } = require("./base.planningConstants");

module.exports = {
    /**
     * Returns whether of not this tile is within the valid base building area.
     * @param {number} x The X component of the position.
     * @param {number} y The Y component of the position.
     * @returns {boolean} True is this tile is within the valid base building area,
     * false otherwise.
     */
    inBuildArea(x, y) {
        return (
            x >= MIN_BUILD_AREA ||
            x <= MAX_BUILD_AREA ||
            y >= MIN_BUILD_AREA ||
            y <= MAX_BUILD_AREA
        );
    },
};
