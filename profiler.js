class Profiler {

    constructor() {
        this.clearRecords();
    }

    clearRecords() {
        this.records = [];
        this.indentLevel = 0;
    }

    track(label, func) {
        const before = Game.cpu.getUsed();
        this.indentLevel++;
        const returnValue = func();
        const after = Game.cpu.getUsed();
        this.indentLevel--;
        this.records.push({ label: label, cpu: (after - before), indent: this.indentLevel });
        return returnValue;
    }

    printout() {
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