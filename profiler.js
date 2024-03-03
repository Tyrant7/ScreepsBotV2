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
        for (const record of this.records) {
            console.log("\t".repeat(record.indent) + record.label + ": " + record.cpu);
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