const { iterateMatrix } = require("./base.matrixUtility");
const { structureToNumber, MAX_VALUE } = require("./base.planningConstants");
const overlay = require("./overlay");

/*
        // Now we have a plan of our RCL deltas, let's combine each plan with all lower plans
        for (let i = 0; i < this.rclStructures.length; i++) {
            for (let past = 0; past < i; past++) {
                this.rclStructures[i] = matrixUtility.combineMatrices(
                    this.rclStructures[i],
                    this.rclStructures[past]
                );
                this.rclRamparts[i] = matrixUtility.combineMatrices(
                    this.rclRamparts[i],
                    this.rclRamparts[past]
                );
            }
        }
*/

const numberToChar = {
    [structureToNumber[STRUCTURE_SPAWN]]: "a",
    [structureToNumber[STRUCTURE_EXTENSION]]: "b",
    [structureToNumber[STRUCTURE_ROAD]]: "c",
    [structureToNumber[STRUCTURE_LINK]]: "d",
    [structureToNumber[STRUCTURE_STORAGE]]: "e",
    [structureToNumber[STRUCTURE_TOWER]]: "f",
    [structureToNumber[STRUCTURE_OBSERVER]]: "g",
    [structureToNumber[STRUCTURE_POWER_SPAWN]]: "h",
    [structureToNumber[STRUCTURE_EXTRACTOR]]: "i",
    [structureToNumber[STRUCTURE_LAB]]: "j",
    [structureToNumber[STRUCTURE_TERMINAL]]: "k",
    [structureToNumber[STRUCTURE_CONTAINER]]: "m",
    [structureToNumber[STRUCTURE_NUKER]]: "n",
    [structureToNumber[STRUCTURE_FACTORY]]: "o",

    // Tiles with ramparts but no structure will get an r
    [0]: "r",
};
const charToNumber = _.invert(numberToChar);

const serializeBasePlan = (rclStructures, rclRamparts) => {
    console.log("serializing plan!");

    const serializedPlans = Array.from(
        { length: rclStructures.length },
        () => ""
    );

    for (let rcl = 0; rcl < serializedPlans.length; rcl++) {
        let whiteSpace = 0;
        iterateMatrix((x, y) => {
            const struc = rclStructures[rcl].get(x, y);
            const hasRampart = rclRamparts[rcl].get(x, y);
            if (struc || hasRampart) {
                const char = hasRampart
                    ? numberToChar[struc].toUpperCase()
                    : numberToChar[struc];
                if (whiteSpace > 0) {
                    serializedPlans[rcl] += whiteSpace.toString();
                    whiteSpace = 0;
                }
                serializedPlans[rcl] += char;
                return;
            }
            whiteSpace++;
        });

        // console.log("plan for RCL " + rcl + ": ");
        // console.log(serializedPlans[rcl]);
    }
    return serializedPlans;
};

const deserializeBasePlan = (serializedPlans, rcl) => {
    const deserializedPlan = {
        structures: new PathFinder.CostMatrix(),
        ramparts: new PathFinder.CostMatrix(),
    };
    const isNumeric = (char) => !Number.isNaN(char);
    for (let current = 0; current <= rcl; current++) {
        const plan = serializedPlans[current];
        let position = 0;
        for (let i = 0; i < plan.length; i++) {
            const char = plan[i];

            // Skip numbers as they appear
            if (isNumeric(char)) {
                continue;
            }

            // Once we hit a character that isn't a number, we'll read back and
            // skip the number of spaces corresponding to the numbers that we skipped prior
            let skip = "";
            for (let j = i - 1; j >= 0; j--) {
                if (isNumeric(plan[j])) {
                    skip = plan[j] + skip;
                    continue;
                }
            }
            position += parseInt(skip) || 0;

            console.log(parseInt(skip));

            const x = position % 50;
            const y = position / 50;
            const trueChar = char.toLowerCase();
            if (trueChar !== char) {
                deserializedPlan.ramparts.set(x, y, MAX_VALUE);
            }
            deserializedPlan.structures.set(x, y, charToNumber[trueChar]);
            position++;
        }
    }

    console.log("visualizing");
    overlay.visualizeBasePlan(
        "W7N7",
        deserializedPlan.structures,
        deserializedPlan.ramparts,
        structureToNumber
    );

    iterateMatrix((x, y) => {});
};

module.exports = { serializeBasePlan, deserializeBasePlan };

function roughSizeOfObject(object) {
    const objectList = [];
    const stack = [object];
    const bytes = [0];
    while (stack.length) {
        const value = stack.pop();
        if (value == null) bytes[0] += 4;
        else if (typeof value === "boolean") bytes[0] += 4;
        else if (typeof value === "string") bytes[0] += value.length * 2;
        else if (typeof value === "number") bytes[0] += 8;
        else if (
            typeof value === "object" &&
            objectList.indexOf(value) === -1
        ) {
            objectList.push(value);
            if (typeof value.byteLength === "number")
                bytes[0] += value.byteLength;
            else if (value[Symbol.iterator]) {
                // eslint-disable-next-line no-restricted-syntax
                for (const v of value) stack.push(v);
            } else {
                Object.keys(value).forEach((k) => {
                    bytes[0] += k.length * 2;
                    stack.push(value[k]);
                });
            }
        }
    }
    return bytes[0];
}
