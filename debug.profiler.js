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
    constructor(label, id) {
        this.label = label;
        this.id = id;
        this.layer = 0;
        this.calls = 0;
        this.children = [];
    }

    addChild(record) {
        this.children.push(record);
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

const clearRecords = () => {
    records = [];
};

const wrapFunction = (method) => {
    const sample = startSample(method.name);
    const returnValue = method();
    endSample(sample);
    return returnValue;
};

const startSample = (label) => {
    if (!records[label]) {
        records[label] = new ProfilerRecord(method.name, records.length);
    }
    records[label].startRecording();
    return records[label];
};

const endSample = (label) => {
    if (!records[label]) {
        return;
    }
    records[label].endRecording();
};

const printout = () => {
    let parentIndent = 0;
    console.log("-".repeat(15) + " Profiler Results " + "-".repeat(15));
    for (const record of records) {
        // Extra some basic stats
        const totalCPU = _.sum(record.usages);
        const averageCPU = totalCPU / record.usages.length;
        const minCPU = _.min(record.usages);
        const maxCPU = _.max(record.usages);

        let message = record.label;
        if (message > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH);
        }

        console.log(message + totalCPU.toFixed(DECIMAL_PLACES));
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

module.exports = { wrapFunction, startSample, endSample };
