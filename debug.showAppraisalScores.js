const { addText } = require("./debug.mapOverlay");

const showAppraisalScores = () => {
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

module.exports = {
    showAppraisalScores,
};
