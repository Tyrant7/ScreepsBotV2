const BAR_LENGTH = 76;
const MAX_MESSAGE_LENGTH = 50;
const DECIMAL_PLACES = 5;

const COLOR_DARK = "#2B2B2B";
const COLOR_LIGHT = "#3B3B3B";

const symbols = {
    [-1000]: "⚪️",
    0: "🟢",
    0.35: "🟡",
    1: "🟠",
    2: "🔴",
};

class ProfilerRecord {
    constructor(label, id, layer) {
        this.label = label;
        this.id = id;
        this.layer = layer;
        this.usages = [];
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

const clearRecords = () => {
    records = {};
    stack = [];
};

const wrap = (label, method) => {
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
    const last = stack.pop();
    const fullLabel = getFullLabel(label);
    if (!records[fullLabel]) {
        stack.push(last);
        return;
    }
    records[fullLabel].endRecording();
};

const printout = (interval) => {
    // Accumulate data over mutliple ticks
    if (Game.time % interval !== 0) {
        return;
    }

    let output = "";
    let dark = false;
    for (const record of Object.values(records)) {
        // Extract some basic stats
        const totalCPU = _.sum(record.usages);
        const calls = record.usages.length;
        const averageCPU = totalCPU / calls;
        const minCPU = _.min(record.usages);
        const maxCPU = _.max(record.usages);
        const diffCPU = maxCPU - minCPU;

        // Find the smallest symbol that matches our usage
        // Scale our usage up if we're profiling over multiple ticks
        const prefix =
            symbols[
                Object.keys(symbols)
                    .sort((a, b) => b - a)
                    .find((key) => averageCPU >= key * interval)
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

    console.log(preOutput + output);

    // Clear records for next profile
    clearRecords();
};

module.exports = { wrap, startSample, endSample, printout };
