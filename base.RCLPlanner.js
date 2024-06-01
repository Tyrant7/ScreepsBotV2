const matrixUtility = require("./base.matrixUtility");
const {
    MAX_VALUE,
    EXCLUSION_ZONE,
    structureToNumber,
    numberToStructure,
    MAX_STRUCTURES,
    MAX_RCL,
} = require("./base.planningConstants");

class RCLPlanner {
    planBuildRCLs(structures, ramparts, fillFromCore) {
        const RCLPlans = Array.from(
            { length: MAX_RCL + 1 },
            () => new PathFinder.CostMatrix()
        );

        const plannedStructures = {};
        const placedStructureCounts = {};
        for (const key in MAX_STRUCTURES) {
            plannedStructures[structureToNumber[key]] = [];
            placedStructureCounts[structureToNumber[key]] = 0;
        }

        matrixUtility.iterateMatrix((x, y) => {
            const s = structures.get(x, y);
            if (!s || s === structureToNumber[EXCLUSION_ZONE]) {
                return;
            }
            plannedStructures[s].push({ x, y });
        });
        for (const structureType in plannedStructures) {
            plannedStructures[structureType].sort(
                (a, b) =>
                    fillFromCore.get(a.x, a.y) - fillFromCore.get(b.x, b.y)
            );

            for (const structure of plannedStructures[structureType]) {
                const count = placedStructureCounts[structureType];
                const mapping =
                    CONTROLLER_STRUCTURES[numberToStructure[structureType]];
                const currentRCL = Object.entries(mapping).find(
                    ([key, value]) => value > count
                )[0];

                RCLPlans[currentRCL].set(
                    structure.x,
                    structure.y,
                    structureType
                );
                placedStructureCounts[structureType]++;
            }
        }

        // Now we have a plan of our RCL deltas, let's combine them going downward
        for (let i = 0; i < RCLPlans.length; i++) {
            for (let past = 0; past < i; past++) {
                RCLPlans[i] = matrixUtility.combineMatrices(
                    RCLPlans[i],
                    RCLPlans[past]
                );
            }
        }

        return RCLPlans;
    }
}

module.exports = RCLPlanner;
