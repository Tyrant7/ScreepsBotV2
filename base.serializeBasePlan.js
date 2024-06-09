const matrixUtility = require("./base.matrixUtility");
const {
    structureToNumber,
    MAX_VALUE,
    HEADER_SIZE,
} = require("./base.planningConstants");

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
    const serializedPlans = Array.from(
        { length: rclStructures.length },
        () => ""
    );

    for (let rcl = 0; rcl < serializedPlans.length; rcl++) {
        let whiteSpace = 0;
        matrixUtility.iterateMatrix((x, y) => {
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
    }
    return serializedPlans;
};

const deserializeBasePlan = (serializedPlans, rcl) => {
    const structures = new PathFinder.CostMatrix();
    const ramparts = new PathFinder.CostMatrix();
    const isNumeric = (char) => /^[+-]?\d+(\.\d+)?$/.test(char);
    for (let current = 0; current < rcl; current++) {
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
                break;
            }
            position += parseInt(skip) || 0;

            const x = position / 50;
            const y = position % 50;
            const trueChar = char.toLowerCase();
            const hasRampart = trueChar !== char;
            if (hasRampart) {
                ramparts.set(x, y, MAX_VALUE);
            }
            // An edge case here is where a rampart can cover a structure at a later RCL to when it was built
            // In that case, we don't want to overwrite the structure with nothing
            if (charToNumber[trueChar] > 0 || !hasRampart) {
                structures.set(x, y, charToNumber[trueChar]);
            }
            position++;
        }
    }
    return { structures, ramparts };
};

const runTests = (rclStructures, rclRamparts) => {
    console.log(
        "-".repeat(HEADER_SIZE) +
            " Validating serialization " +
            "-".repeat(HEADER_SIZE)
    );

    const completeRCLStructures = [];
    const completeRCLRamparts = [];

    // Since rclStructures is only deltas, we'll combine them with
    // all lower plans to get the "complete" plan for that RCL
    for (let i = 0; i < rclStructures.length; i++) {
        let nextStructures = rclStructures[i];
        let nextRamparts = rclRamparts[i];
        for (let past = i - 1; past >= 0; past--) {
            nextStructures = matrixUtility.combineMatrices(
                nextStructures,
                rclStructures[past]
            );
            nextRamparts = matrixUtility.combineMatrices(
                nextStructures,
                rclRamparts[past]
            );
        }
        completeRCLStructures.push(nextStructures);
        completeRCLRamparts.push(nextRamparts);
    }

    const serializeCPU = Game.cpu.getUsed();
    const serializedPlans = serializeBasePlan(rclStructures, rclRamparts);
    console.log(
        `🟢 Serialized base plans with ${(
            Game.cpu.getUsed() - serializeCPU
        ).toFixed(DEBUG.cpuPrintoutFigures)} CPU`
    );

    const deserializeCPU = Game.cpu.getUsed();
    for (let rcl = 0; rcl < completeRCLStructures.length; rcl++) {
        const { structures: deserializedStructures } = deserializeBasePlan(
            serializedPlans,
            rcl
        );
        const error = verifyIndenticality(
            completeRCLStructures[rcl],
            deserializedStructures
        );
        if (error) {
            console.log(
                `🔴 Plans at RCL ${rcl} do not match after deserialization!`
            );
            console.log(`🔴 Error at ${error}`);
            return;
        }
    }
    console.log(
        `🟢 Deserialized base plans with ${(
            Game.cpu.getUsed() - deserializeCPU
        ).toFixed(DEBUG.cpuPrintoutFigures)} CPU`
    );

    // Determine the size of our serialized plans
    let size = 0;
    const stack = [...serializedPlans];
    while (stack.length) {
        const value = stack.pop();
        size += value.length;
    }

    console.log(
        `🟢 Plan serialization successful and matches deserialization. ` +
            `All base plans serialized with a size of: ${size} chars`
    );
    console.log(
        "-".repeat(HEADER_SIZE) +
            " Serialized plans for each RCL " +
            "-".repeat(HEADER_SIZE)
    );
    let rcl = 0;
    for (const plan of serializedPlans) {
        console.log(
            // Wrap every 196 characters
            "RCL " + rcl + ": " + plan.replace(/.{196}/g, "$&\n       ")
        );
        rcl++;
    }
};

const verifyIndenticality = (beforePlan, afterPlan) => {
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const before = beforePlan.get(x, y);
            const after = afterPlan.get(x, y);
            if (before !== after) {
                return `Position { x: ${x}, y: ${y} }. Before serialization: ${before}, after deserialization: ${after}`;
            }
        }
    }
};

module.exports = {
    serializeBasePlan,
    deserializeBasePlan,
    runTests,
};
