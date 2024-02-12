const defaultStyle = {
    fill: "#FFFFFF",
};

const defaultText = {
    color: "#FFFFFF",
    align: "left",
};

const panelStyle = {
    fill: "#000000",
    opacity: 0.35,
    stroke: "#000000",
    strokeWidth: 0.35,
};

module.exports = {
    
    addText: function(roomName, importantFigures) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (!this.panels) {
            this.panels = {};
        }
        if (!this.panels[roomName] || this.panels[roomName].shouldRedraw) {
            this.panels[roomName] = { shouldRedraw: false, elements: [] };
        }
        this.panels[roomName].elements.push(...Object.keys(importantFigures).map((fig) => {
            return fig + ": " + importantFigures[fig];
        }));
    },

    finalizePanels: function(roomName, anchor = "right") {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (!this.panels) {
            return;
        }

        const panel = this.panels[roomName];
        if (!panel) {
            return;
        }

        // Draw the panel itself first
        const heightMultiplier = 1;
        const panelHeight = (panel.elements.length * heightMultiplier) + 1;
        const panelWidth = 10;
        const x = anchor === "left" ? -0.5 + panelStyle.strokeWidth / 2: 49.5 - panelWidth - panelStyle.strokeWidth / 2;
        const y = -0.5 + panelStyle.strokeWidth / 2;
        const visual = new RoomVisual(roomName).rect(x, y, panelWidth, panelHeight, panelStyle);

        // Add text to the panel for each element
        let offset = 0.5 + panelStyle.strokeWidth / 2;
        for (const element of panel.elements) {
            visual.text(element, x + 0.5, offset, defaultText);
            offset++;
        }

        // Mark this panel to redraw
        panel.shouldRedraw = true;
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
};