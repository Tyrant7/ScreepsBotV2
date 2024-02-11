const defaultStyle = {
    fill: "#FFFFFF",
}

const defaultText = {
    color: "#FFFFFF",
}

module.exports = {
    
    text: function(roomName, importantFigures, style = defaultText) {

        if (!DEBUG.drawOverlay) {
            return;
        }

        // If we've already drawn visuals this tick, don't overlap them
        let offset = 0.5;
        let visual;
        if (this.cachedLastTick === Game.time) {
            offset = this.cachedOffset;
            visual = this.cachedVisual;
        }
        else {
            visual = new RoomVisual(roomName).text(roomName, 0, offset, { align: "left" });
            offset++;
        }

        // Draw a simple overlay
        for (const figure in importantFigures) {
            visual.text(figure + ": " + importantFigures[figure], 0, offset, { align: "left" });
            offset++;
        }

        // Save our offset and tick
        this.cachedOffset = offset;
        this.cachedLastTick = Game.time;
        this.cachedVisual = visual;
    },

    rects: function(positions, width = 0.5, height = 0.5, style = defaultStyle) {

        if (!DEBUG.drawOverlay) {
            return;
        }

        const visuals = {};
        positions.forEach((pos) => {
            if (!visuals[pos.roomName]) {
                visuals[pos.roomName] = new RoomVisual(pos.roomName);
            }
            visuals[pos.roomName].rect(pos.x - width / 2, pos.y - height / 2, width, height, style);
        });
    },

    circles: function(positions, style = defaultStyle) {

        if (!DEBUG.drawOverlay) {
            return;
        }

        const visuals = {};
        positions.forEach((pos) => {
            if (!visuals[pos.roomName]) {
                visuals[pos.roomName] = new RoomVisual(pos.roomName);
            }
            visuals[pos.roomName].circle(pos.x, pos.y, style);
        });
    },
}