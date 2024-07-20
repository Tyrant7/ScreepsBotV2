const { addText } = require("./debug.mapOverlay");

const showAppraisalScores = () => {
    for (const room in Memory.scoutData) {
        const data = Memory.scoutData[room];
        if (!data.expansionScore) continue;
        addText(room, "🏡" + Math.round(data.expansionScore));
    }
};

module.exports = {
    showAppraisalScores,
};
