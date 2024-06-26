const BAR_LENGTH = 96;
const MAX_MESSAGE_LENGTH = 50;
const DECIMAL_PLACES = 5;

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
    const intentPrototypes = [
        Creep,
        PowerCreep,
        ConstructionSite,
        Structure,
        StructureController,
        StructureSpawn,
        StructureSpawn.Spawning,
        StructureTerminal,
        StructureLab,
        StructureNuker,
        StructureRampart,
    ];
    const excludeProps = ["constructor", "toJSON", "toString", "pull", "say"];

    for (const type of intentPrototypes) {
        if (!type || !type.prototype) {
            continue;
        }
        const proto = type.prototype;
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

    let output = "";
    let dark = false;
    let i = 0;
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
        let indent = record.layer;
        if (indent > 1) {
            guidelines += "|  ".repeat(indent - 1);
        }
        if (indent > 0) {
            guidelines += "|--";
            indent--;
        }

        // Our label
        const label = record.label.split(".").slice(-1)[0];
        let message = `[${prefix}] ${guidelines}${label}`;
        if (message > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH);
        }

        const formatRow = (label, value) => {
            return (
                `\t| ${label}:` +
                " ".repeat(4 - value.toString().split(".")[0].length) +
                value.toFixed(DECIMAL_PLACES)
            );
        };

        // Stats table
        message += " ".repeat(MAX_MESSAGE_LENGTH - message.length);
        message += " => ";
        message += formatRow("Total", totalCPU);
        message += formatRow("Raw", rawCPU);
        message += "\t| Intents: " + intents;
        message += "\t| Calls: " + calls;
        message += formatRow("Avg", averageCPU);
        message += formatRow("Min", minCPU);
        message += formatRow("Max", maxCPU);
        message += formatRow("Diff", diffCPU);

        // Append new message
        output += `<div style="background:${
            dark ? COLOR_DARK : COLOR_LIGHT
        };">${message}<div>`;
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

    for (let i = 0; i < FILLER; i++) console.log(" ");
    console.log(preOutput + output);

    // Clear records for next profile
    clearRecords();
};

if (DEBUG.runProfiler) {
    initialize();
}
module.exports = { wrap, startSample, endSample, printout };
