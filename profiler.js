class Profiler {

    constructor() {
        this.clearRecords();
    }

    clearRecords() {
        this.records = [];
        this.indentLevel = 0;
    }

    startSample(label) {
        if (!DEBUG.runProfiler) {
            return;
        }
        const before = Game.cpu.getUsed();
        this.records.push({ label: label, cpu: -before, indent: this.indentLevel });
        this.indentLevel++;
    }

    endSample(label) {
        if (!DEBUG.runProfiler) {
            return;
        }
        const after = Game.cpu.getUsed();
        const record = this.records.find((record) => record.label === label);
        record.cpu += after;
        this.indentLevel--;
    }

    printout() {
        if (!DEBUG.runProfiler) {
            return;
        }
        const MAX_MESSAGE_LENGTH = 50;
        const DECIMAL_PLACES = 5; 

        let parentIndent = 0;
        console.log("-".repeat(15) + " Profiler Results " + "-".repeat(15));
        for (const record of this.records) {
            const symbols = {
                [-1000]: "⚪️",
                0: "🟢",
                0.35: "🟡",
                1: "🟠",
                2: "🔴",
            };
            const prefix = symbols[Object.keys(symbols).sort((a, b) => b - a).find((key) => record.cpu >= key)];
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
            console.log(message + " ".repeat(MAX_MESSAGE_LENGTH - message.length) + guidelines + record.cpu.toFixed(DECIMAL_PLACES));
        }
        this.clearRecords();
    }
}

let profiler = null;
function getInstance() {
    if (!profiler) {
        profiler = new Profiler();
    }
    return profiler;
}

module.exports = getInstance();