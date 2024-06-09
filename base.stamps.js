const { EXCLUSION_ZONE } = require("./base.planningConstants");

module.exports = {
    core: {
        // Layout of the structures for this stamp
        // Y, X
        layout: [
            [
                undefined,
                undefined,
                undefined,
                STRUCTURE_ROAD,
                undefined,
                undefined,
                undefined,
            ],
            [
                undefined,
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
                undefined,
            ],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_STORAGE,
                STRUCTURE_EXTENSION,
                STRUCTURE_SPAWN,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_TERMINAL,
                EXCLUSION_ZONE,
                STRUCTURE_FACTORY,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                ,
            ],
            [
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_POWER_SPAWN,
                STRUCTURE_NUKER,
                STRUCTURE_LINK,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                undefined,
                undefined,
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
                undefined,
            ],
            [
                undefined,
                undefined,
                undefined,
                STRUCTURE_ROAD,
                undefined,
                undefined,
                undefined,
            ],
        ],
        // Points used for validating distances around this stamp to ensure
        // no overlap with each other or terrain
        // Relative to the top left corner
        distancePoints: [
            { x: 3, y: 0, range: 0 },
            { x: 2, y: 2, range: 1 },
            { x: 0, y: 3, range: 0 },
            { x: 2, y: 4, range: 1 },
            { x: 3, y: 6, range: 0 },
            { x: 4, y: 4, range: 1 },
            { x: 6, y: 3, range: 0 },
            { x: 4, y: 2, range: 1 },
            { x: 3, y: 3, range: 1 },
        ],
        // The center for placement
        // The stamp will be attempted to place with this tile on the lowest scoring weight
        center: { x: 3, y: 3 },
    },

    extensionStampX: {
        layout: [
            [undefined, undefined, undefined, undefined, undefined],
            [
                undefined,
                undefined,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_EXTENSION,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
            ],
            [undefined, undefined, STRUCTURE_EXTENSION, undefined, undefined],
            [undefined, undefined, STRUCTURE_ROAD, undefined, undefined],
        ],
        distancePoints: [
            { x: 2, y: 2, range: 1 },
            { x: 3, y: 1, range: 0 },
            { x: 2, y: 4, range: 0 },
            { x: 0, y: 2, range: 0 },
            { x: 4, y: 2, range: 0 },
        ],
        center: { x: 2, y: 2 },
    },

    extensionStampXWithSpawn: {
        layout: [
            [undefined, undefined, undefined, undefined, undefined],
            [
                undefined,
                undefined,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
                undefined,
            ],
            [
                STRUCTURE_ROAD,
                STRUCTURE_EXTENSION,
                STRUCTURE_SPAWN,
                STRUCTURE_EXTENSION,
                STRUCTURE_ROAD,
            ],
            [undefined, undefined, STRUCTURE_EXTENSION, undefined, undefined],
            [undefined, undefined, STRUCTURE_ROAD, undefined, undefined],
        ],
        distancePoints: [
            { x: 2, y: 2, range: 1 },
            { x: 3, y: 1, range: 0 },
            { x: 2, y: 4, range: 0 },
            { x: 0, y: 2, range: 0 },
            { x: 4, y: 2, range: 0 },
        ],
        center: { x: 2, y: 2 },
    },

    labs: {
        layout: [
            [undefined, STRUCTURE_LAB, STRUCTURE_LAB, EXCLUSION_ZONE],
            [STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB],
            [STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB],
            [EXCLUSION_ZONE, STRUCTURE_LAB, STRUCTURE_LAB, undefined],
        ],
        distancePoints: [
            { x: 2, y: 1, range: 1 },
            { x: 1, y: 2, range: 1 },
        ],
        center: { x: 3, y: 0 },
    },
};
