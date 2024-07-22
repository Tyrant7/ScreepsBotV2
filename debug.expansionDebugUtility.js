const { addText, drawArrow } = require("./debug.mapOverlay");

const showAppraisalScores = () => {
    // No scouting data
    if (!Object.values(Memory.scoutData).length) return;

    // Find our highest score to mark it green later
    const highestScore = Object.values(Memory.scoutData).reduce(
        (highest, curr) =>
            curr.expansionScore > highest.expansionScore ? curr : highest
    ).expansionScore;
    for (const room in Memory.scoutData) {
        const data = Memory.scoutData[room];
        if (!data.expansionScore) continue;
        const colour =
            highestScore === data.expansionScore ? "#00FF00" : "#FFFFFF";
        addText(room, "🏡" + Math.round(data.expansionScore), colour);
    }
};

const showExpansionTargets = () => {
    for (const newColony in Memory.newColonies) {
        for (const colony of Memory.newColonies[newColony].supporters) {
            drawArrow(newColony, colony, {
                color: "6BEB2A",
                lineStyle: "dotted",
                width: 1.5,
            });
        }
    }
};

module.exports = {
    showAppraisalScores,
    showExpansionTargets,
};
