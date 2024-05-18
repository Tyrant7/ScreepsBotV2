const utility = require("./base.planningUtility");
const {
    EXCLUSION_ZONE,
    structureToNumber,
} = require("./base.planningConstants");

module.exports = {
    /**
     * Determines if a stamp fits in a given area given its distance points, taking into consideration the distance
     * to edges and any other planned structures.
     * @param {{}} stamp The stamp to determine fitness for.
     * @param {{ x: number, y: number }} pos An object with an X and Y coordinates representing
     * where the stamp will be placed.
     * @param {PathFinder.CostMatrix} distanceTransform A cost matrix representing the distance
     * to the nearest terrain tile in any given direction.
     * @param {PathFinder.CostMatrix} existingPlans A cost matrix representing the current planned
     * room configuration.
     * @returns {boolean} True if all distance points fit within the given parameters, false otherwise.
     */
    stampFits: function (stamp, pos, distanceTransform, existingPlans) {
        for (const point of stamp.distancePoints) {
            const newX = pos.x + point.x - stamp.center.x;
            const newY = pos.y + point.y - stamp.center.y;
            if (distanceTransform.get(newX, newY) <= point.range) {
                return false;
            }

            // Look at all points within range of this one to ensure nothing else is placed there
            for (let x = -point.range; x <= point.range; x++) {
                for (let y = -point.range; y <= point.range; y++) {
                    const nextX = newX + x;
                    const nextY = newY + y;
                    if (!utility.inBuildArea(nextX, nextY)) {
                        return false;
                    }

                    const obstructor = existingPlans.get(nextX, nextY);
                    const wanted = stamp.layout[point.y + y][point.x + x];
                    const stampHasRoadOrExclusion =
                        wanted === STRUCTURE_ROAD ||
                        wanted === EXCLUSION_ZONE ||
                        wanted === undefined;
                    const obstructorIsRoadOrExclusion =
                        obstructor === structureToNumber[STRUCTURE_ROAD] ||
                        obstructor === structureToNumber[EXCLUSION_ZONE];

                    // We can skip validating this point if it's an
                    // unwalkable structure on top of another unwalkable structure
                    if (
                        stampHasRoadOrExclusion &&
                        obstructorIsRoadOrExclusion
                    ) {
                        continue;
                    }
                    if (obstructor > 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    },

    /**
     * Places the given stamp into the plan matrix at the appropriate position, returning the modified matrix object.
     * @param {{}} stamp The stamp to place.
     * @param {{ x: number, y: number }} pos The position to place the stamp. Measured from the stamp's centre object.
     * @param {PathFinder.CostMatrix} planMatrix The matrix to modify.
     * @returns {PathFinder.CostMatrix} The modified plan matrix.
     */
    placeStamp: function (stamp, pos, planMatrix) {
        for (let y = 0; y < stamp.layout.length; y++) {
            for (let x = 0; x < stamp.layout[y].length; x++) {
                const structureValue = structureToNumber[stamp.layout[y][x]];
                const trueX = pos.x - stamp.center.x + x;
                const trueY = pos.y - stamp.center.y + y;
                if (structureValue) {
                    planMatrix.set(trueX, trueY, structureValue);
                }
            }
        }
        return planMatrix;
    },

    /**
     * Creates a deep copy of the given stamp whose new layout is mirrored across the horizontal axis.
     * @param {{}} stamp The stamp to mirror.
     * @returns {{}} A new, vertically mirrored stamp.
     */
    mirrorStamp: function (stamp) {
        // Deep copy our stamp to ensure the original remains unmodified
        stamp = JSON.parse(JSON.stringify(stamp));
        const dimensions = {
            x: stamp.layout[0].length,
            y: stamp.layout.length,
        };
        stamp.layout.reverse();
        for (const p of stamp.distancePoints) {
            p.y = dimensions.y - 1 - p.y;
        }
        stamp.center.y = dimensions.y - 1 - stamp.center.y;
        return stamp;
    },

    /**
     * Creates a deep copy of the given stamp whose new layout is rotated counter-clockwise
     * and mirror across the vertical axis.
     * @param {{}} stamp The stamp to mirror.
     * @returns {{}} A new, rotated stamp.
     */
    rotateStamp: function (stamp) {
        stamp = JSON.parse(JSON.stringify(stamp));
        stamp.layout = _.zip(...stamp.layout);
        for (const p of stamp.distancePoints) {
            const temp = p.x;
            p.x = p.y;
            p.y = temp;
        }

        const temp = stamp.center.x;
        stamp.center.x = stamp.center.y;
        stamp.center.y = temp;
        return stamp;
    },

    /**
     * Returns a set list of all transformations needed to cover all possible orientations
     * for any given asymmetrical stamp.
     * @returns {(stamp: {}) => {}} An array of functions, each which transform the layout of a
     * stamp object in different ways.
     */
    getTransformationList: function () {
        return [
            (stamp) => stamp,
            (stamp) => this.mirrorStamp(stamp),
            (stamp) => this.rotateStamp(stamp),
            (stamp) => this.mirrorStamp(this.rotateStamp(stamp)),
            (stamp) => this.rotateStamp(this.mirrorStamp(stamp)),
            (stamp) =>
                this.rotateStamp(this.mirrorStamp(this.rotateStamp(stamp))),
            (stamp) =>
                this.mirrorStamp(this.rotateStamp(this.mirrorStamp(stamp))),
            (stamp) =>
                this.rotateStamp(
                    this.mirrorStamp(this.rotateStamp(this.mirrorStamp(stamp)))
                ),
        ];
    },
};
