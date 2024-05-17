const {
    MAX_BUILD_AREA,
    MIN_BUILD_AREA,
    EXCLUSION_ZONE,
    structureToNumber,
} = require("./base.planningConstants");

module.exports = {
    stampFits: function (stamp, pos, distanceTransform, existingPlans) {
        for (const point of stamp.distancePoints) {
            const newX = pos.x + point.x - stamp.center.x;
            const newY = pos.y + point.y - stamp.center.y;
            if (distanceTransform.get(newX, newY) <= point.range) {
                return false;
            }

            if (point.range === 0) {
                const obstructor = existingPlans.get(newX, newY);
                const stampHasRoad =
                    stamp.layout[point.y][point.x] === STRUCTURE_ROAD;
                const obstructorIsRoadOrExclusion =
                    obstructor === structureToNumber[STRUCTURE_ROAD] ||
                    obstructor === structureToNumber[EXCLUSION_ZONE];

                // We can skip validating this point if it's only on a road being blocked by a road, for example
                if (stampHasRoad && obstructorIsRoadOrExclusion) {
                    continue;
                }
            }

            // Look at all points within range of this one to ensure nothing else is placed there
            for (let x = -point.range; x <= point.range; x++) {
                for (let y = -point.range; y <= point.range; y++) {
                    if (
                        newX + x < MIN_BUILD_AREA ||
                        newX + x > MAX_BUILD_AREA ||
                        newY + y < MIN_BUILD_AREA ||
                        newY + y > MAX_BUILD_AREA
                    ) {
                        return false;
                    }
                    if (existingPlans.get(newX + x, newY + y) > 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    },

    placeStamp: function (stamp, pos, planMatrix, terrainMatrix) {
        for (let y = 0; y < stamp.layout.length; y++) {
            for (let x = 0; x < stamp.layout[y].length; x++) {
                const structureValue = structureToNumber[stamp.layout[y][x]];
                const trueX = pos.x - stamp.center.x + x;
                const trueY = pos.y - stamp.center.y + y;
                if (structureValue && terrainMatrix.get(trueX, trueY) === 0) {
                    planMatrix.set(trueX, trueY, structureValue);
                }
            }
        }
        return planMatrix;
    },

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
