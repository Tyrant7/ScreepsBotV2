module.exports = function(room, importantFigures) {

    // Draw a simple overlay
    let offset = 0.5;
    const visual = new RoomVisual().text(room.name, 0, offset, { align: "left" });
    offset++;
    for (const figure in importantFigures) {
        visual.text(figure + ": " + importantFigures[figure], 0, offset, { align: "left" });
        offset++;
    }
}