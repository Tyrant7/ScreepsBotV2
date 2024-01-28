module.exports = {
    
    text: function(room, importantFigures) {

        // Draw a simple overlay
        let offset = 0.5;
        const visual = new RoomVisual().text(room.name, 0, offset, { align: "left" });
        offset++;
        for (const figure in importantFigures) {
            visual.text(figure + ": " + importantFigures[figure], 0, offset, { align: "left" });
            offset++;
        }
    },

    squares: function(room, positions, colour) {

        const visual = new RoomVisual(room);
        positions.forEach((pos) => {
            visual.rect(pos.x - 0.5, pos.y - 0.5, 0.8, 0.8, { fill: colour });
        });
    }
}