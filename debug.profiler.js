const BAR_LENGTH = 110;
const MAX_MESSAGE_LENGTH = 50;
const DECIMAL_PLACES = 5;

/**
 * One of the following sort modes, else defaults to call order:
 * - default
 * - total
 * - raw
 * - intents
 * - calls
 * - avg
 * - rawAvg
 * - min
 * - max
 * - diff
 */
const SORT_MODE = "default";
const SORT_BY_ASCENDING = false;

// Flood the console with empty messages to prevent lagging the client
// with too many large profiler printouts
const FILLER = 0;

const COLOR_DARK = "#2B2B2B";
const COLOR_LIGHT = "#3B3B3B";

const symbols = {
    [-1000]: "⚪️",
    0: "🟢",
    0.2: "🟡",
    0.5: "🟠",
    1: "🔴",
};

class ProfilerRecord {
    constructor(label, id, layer) {
        this.label = label;
        this.id = id;
        this.layer = layer;
        this.usages = [];
        this.intents = 0;
    }

    startRecording() {
        this.layer++;
        this.usages.push(Game.cpu.getUsed());
    }

    endRecording() {
        this.layer--;
        this.usages.push(Game.cpu.getUsed() - this.usages.pop());
    }
}

let records = {};
let stack = [];

const initialize = () => {
    // Does not include Game.notify()
    const intentPrototypes = [
        Creep,
        PowerCreep,
        ConstructionSite,
        Structure,
        StructureController,
        StructureSpawn,
        StructurePowerSpawn,
        StructureSpawn.Spawning,
        StructureTerminal,
        StructureLab,
        StructureNuker,
        StructureFactory,
        StructureTower,
        StructureObserver,
        StructureRampart,
        Room,
        RoomPosition,
        Game.market,
    ];

    // Any property methods that could return 0 should
    // go here to prevent false-positives
    const excludeProps = [
        "constructor",
        "toJSON",
        "toString",
        "pull",
        "say",
        "getRangeTo",
    ];

    for (const type of intentPrototypes) {
        const proto = type.prototype ? type.prototype : type;
        for (const prop of Object.getOwnPropertyNames(proto)) {
            if (excludeProps.includes(prop)) {
                continue;
            }
            try {
                if (typeof proto[prop] === "function") {
                    const originalFunc = proto[prop];
                    const wrappedFunc = function (...args) {
                        const result = originalFunc.apply(this, args);
                        if (result === OK) {
                            countIntent();
                        }
                        return result;
                    };
                    proto[prop] = wrappedFunc;
                }
            } catch (e) {
                continue;
            }
        }
    }
};

const countIntent = () => {
    const label = getFullLabel("").slice(0, -1);
    records[label].intents++;
};

const clearRecords = () => {
    records = {};
    stack = [];
};

const wrap = (label, method) => {
    if (!DEBUG.runProfiler) {
        return method();
    }
    startSample(label);
    const returnValue = method();
    endSample(label);
    return returnValue;
};

const getFullLabel = (label) => {
    if (!stack.length) {
        return label;
    }
    return stack.reduce((acc, curr) => acc + curr + ".", "") + label;
};

const startSample = (label) => {
    if (!DEBUG.runProfiler) {
        return;
    }

    // We'll create separate records for each call stack into different methods
    const fullLabel = getFullLabel(label);
    if (!records[fullLabel]) {
        records[fullLabel] = new ProfilerRecord(
            fullLabel,
            records.length,
            stack.length
        );
    }
    records[fullLabel].startRecording();
    stack.push(label);
};

const endSample = (label) => {
    if (!DEBUG.runProfiler) {
        return;
    }

    const last = stack.pop();
    const fullLabel = getFullLabel(label);
    if (!records[fullLabel]) {
        stack.push(last);
        return;
    }
    records[fullLabel].endRecording();
};

const printout = (interval) => {
    if (!DEBUG.runProfiler) {
        return;
    }

    // Accumulate data over mutliple ticks
    if (Game.time % interval !== 0) {
        return;
    }

    const formatColumn = (label, value) => {
        return (
            `\t| ${label}:` +
            " ".repeat(4 - value.toString().split(".")[0].length) +
            value.toFixed(DECIMAL_PLACES)
        );
    };

    let output = "";
    let i = 0;

    let finalRawTotal = 0;
    let rows = [];

    const recordValues = Object.values(records);
    for (const record of recordValues) {
        // Extract some basic stats
        const totalCPU = _.sum(record.usages);
        const intents = record.intents;
        const calls = record.usages.length;
        const averageCPU = totalCPU / calls;
        const minCPU = _.min(record.usages);
        const maxCPU = _.max(record.usages);
        const diffCPU = maxCPU - minCPU;

        // Let's iterate forward over all immediate children of this record
        // that way we can calculate only the overhead from this sample, and not
        // include the cost of children samples
        let childCost = 0;
        for (
            let j = i + 1;
            recordValues[j] && recordValues[j].layer > record.layer;
            j++
        ) {
            if (recordValues[j].layer === record.layer + 1) {
                childCost += _.sum(recordValues[j].usages);
            }
        }
        i++;
        const rawCPU = totalCPU - childCost - intents * 0.2;
        const rawAvg = rawCPU / calls;

        finalRawTotal += rawCPU;

        // Find the smallest symbol that matches our usage
        // Scale our usage up if we're profiling over multiple ticks
        const prefix =
            symbols[
                Object.keys(symbols)
                    .sort((a, b) => b - a)
                    .find((key) => rawCPU >= key * interval)
            ];

        // Figure out where to place our guidelines
        let guidelines = "";
        if (SORT_MODE === "default") {
            let indent = record.layer;
            if (indent > 1) {
                guidelines += "|  ".repeat(indent - 1);
            }
            if (indent > 0) {
                guidelines += "|--";
                indent--;
            }
        }

        // Our label
        const label = record.label.split(".").slice(-1)[0];
        let message = `[${prefix}] ${guidelines}${label}`;
        if (message > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH);
        }

        // Stats table
        message += " ".repeat(MAX_MESSAGE_LENGTH - message.length);
        message += formatColumn("Total", totalCPU);
        message += formatColumn("Raw", rawCPU);
        message += "\t| Intents: " + intents;
        message += "\t| Calls: " + calls;
        message += formatColumn("Avg", averageCPU);
        message += formatColumn("Raw Avg", rawAvg);
        message += formatColumn("Min", minCPU);
        message += formatColumn("Max", maxCPU);
        message += formatColumn("Diff", diffCPU);
        rows.push({
            message: message,
            total: totalCPU,
            raw: rawCPU,
            intents: intents,
            calls: calls,
            avg: averageCPU,
            rawAvg: rawAvg,
            min: minCPU,
            max: maxCPU,
            diff: diffCPU,
        });
    }

    if (SORT_MODE !== "default") {
        rows.sort((a, b) => {
            if (SORT_BY_ASCENDING) {
                return a[SORT_MODE] - b[SORT_MODE];
            }
            return b[SORT_MODE] - a[SORT_MODE];
        });
    }

    let dark = false;
    for (const row of rows) {
        // Append new message
        output += `<div style="background:${
            dark ? COLOR_DARK : COLOR_LIGHT
        };">${row.message}<div>`;
        dark = !dark;
    }

    let preOutput = "";
    const bar = "-".repeat(BAR_LENGTH);
    const heading = `${bar} Profiler Results (Over ${interval} Tick${
        interval === 1 ? "" : "s"
    }) ${bar}`;
    preOutput += "\n" + heading;

    const heapData = Game.cpu.getHeapStatistics();
    const heapUsage =
        ((heapData.total_heap_size + heapData.externally_allocated_size) /
            heapData.heap_size_limit) *
        100;
    preOutput += `\n Heap Usage: ${heapUsage.toFixed(2)}%`;

    const totalUsage = _.sum(recordValues.map((r) => _.sum(r.usages)));
    const totalIntents = _.sum(recordValues.map((r) => r.intents));

    let footer = "\nTotals: ";
    footer += " ".repeat(MAX_MESSAGE_LENGTH - "Totals: ".length);
    footer += formatColumn("  CPU", totalUsage);
    footer += formatColumn("Raw", totalUsage - totalIntents * 0.2);
    footer += "\t| Intents: " + totalIntents;
    output += `<div style="background:${COLOR_DARK};">${footer}<div>`;

    for (let i = 0; i < FILLER; i++) console.log(" ");
    console.log(preOutput + output);

    // Clear records for next profile
    clearRecords();
};

if (DEBUG.runProfiler) {
    initialize();
}
module.exports = { wrap, startSample, endSample, printout };
