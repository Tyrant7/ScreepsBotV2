const MAX_MESSAGE_LENGTH = 50;
const DECIMAL_PLACES = 5;

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

const startSample = (label) => {
    if (!records[label]) {
        // We'll create separate records for each call stack into different methods
        const recordLabel =
            stack.reduce((acc, curr) => acc + curr + ".", "") + label;
        records[label] = new ProfilerRecord(
            recordLabel,
            records.length,
            stack.length
        );
    }
    records[label].startRecording();
    stack.push(label);
    return records[label];
};

const endSample = (label) => {
    if (!records[label]) {
        return;
    }
    records[label].endRecording();
    stack.pop();
};

const printout = () => {
    console.log("-".repeat(50) + " Profiler Results " + "-".repeat(50));
    for (const record of Object.values(records)) {
        // Extract some basic stats
        const totalCPU = _.sum(record.usages);
        const calls = record.usages.length;
        const averageCPU = totalCPU / calls;
        const minCPU = _.min(record.usages);
        const maxCPU = _.max(record.usages);

        // Find the smallest symbol that matches our usage
        const prefix =
            symbols[
                Object.keys(symbols)
                    .sort((a, b) => b - a)
                    .find((key) => averageCPU >= key)
            ];

        let guidelines = "";
        let indent = record.layer;
        if (indent > 1) {
            guidelines += "|  ".repeat(indent - 1);
        }
        if (indent > 0) {
            guidelines += "|--";
            indent--;
        }

        let message = `[${prefix}] ${guidelines}${record.label}`;
        if (message > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH);
        }

        message += "-".repeat(MAX_MESSAGE_LENGTH - message.length);
        message += " => ";
        message += "\tTotal: " + totalCPU.toFixed(DECIMAL_PLACES);
        message += "\tCalls: " + calls;
        message += "\tAvg: " + averageCPU.toFixed(DECIMAL_PLACES);
        message += "\tMin: " + minCPU.toFixed(DECIMAL_PLACES);
        message += "\tMax: " + maxCPU.toFixed(DECIMAL_PLACES);
        console.log(message);
    }
    clearRecords();

    /*
    for (const record of this.records) {
        // Find the smallest symbol that matches our usage
        const prefix =
            symbols[
                Object.keys(symbols)
                    .sort((a, b) => b - a)
                    .find((key) => record.cpu >= key)
            ];
        let guidelines = "";
        let indent = record.indent - parentIndent;
        if (indent > 1) {
            guidelines += "|  ".repeat(indent - 1);
        }
        if (indent > 0) {
            guidelines += "|--";
            indent--;
        }
        parentIndent = Math.min(record.indent, parentIndent);

        let message = "[" + prefix + "] " + guidelines + record.label;
        if (message.length > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH);
        }
        console.log(
            message +
                " ".repeat(MAX_MESSAGE_LENGTH - message.length) +
                guidelines +
                record.cpu.toFixed(DECIMAL_PLACES)
        );
    }
        */
};

module.exports = { wrap, startSample, endSample, printout };
