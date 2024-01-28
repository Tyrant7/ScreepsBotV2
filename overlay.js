const defaultStyle = {
    colour: "#FFFFFF",
}

module.exports = {
    
    text: function(room, importantFigures) {

        // Draw a simple overlay
        let offset = 0.5;
        const visual = new RoomVisual(room.name).text(room.name, 0, offset, { align: "left" });
        offset++;
        for (const figure in importantFigures) {
            visual.text(figure + ": " + importantFigures[figure], 0, offset, { align: "left" });
            offset++;
        }
    },

    rects: function(positions, width = 0.5, height = 0.5, style = defaultStyle) {

        const visuals = {};
        positions.forEach((pos) => {
            if (!visuals[pos.roomName]) {
                visuals[pos.roomName] = new RoomVisual(pos.roomName);
            }
            visuals[pos.roomName].rect(pos.x, pos.y, width, height, style);
        });
    },

    circles: function(positions, style = defaultStyle) {

        const visuals = {};
        positions.forEach((pos) => {
            if (!visuals[pos.roomName]) {
                visuals[pos.roomName] = new RoomVisual(pos.roomName);
            }
            visuals[pos.roomName].circle(pos.x, pos.y, style);
        });
    },
}