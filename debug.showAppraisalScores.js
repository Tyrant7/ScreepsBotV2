const { addText } = require("./debug.mapOverlay");

const showAppraisalScores = () => {
    for (const room in Memory.scoutData) {
        const data = Memory.scoutData[room];
        if (data.expansionScore === undefined) continue;
        addText(room, "🏡" + data.expansionScore);
    }
};

module.exports = {
    showAppraisalScores,
};
