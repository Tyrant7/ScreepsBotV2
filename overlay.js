const defaultStyle = {
    fill: "#FFFFFF",
};

const defaultText = {
    color: "#FFFFFF",
    align: "left",
    font: "0.7 monospace",
};

const panelStyle = {
    fill: "#000000",
    opacity: 0.35,
    stroke: "#000000",
    strokeWidth: 0.35,
};

const matrixDisplayColor = "#fcba03";

module.exports = {
    addText: function (roomName, importantFigures) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (!this.panels) {
            this.panels = {};
        }
        if (!this.panels[roomName] || this.panels[roomName].shouldRedraw) {
            this.panels[roomName] = { shouldRedraw: false, elements: [] };
        }
        this.panels[roomName].elements.push(
            ...Object.keys(importantFigures).map((fig) => {
                return {
                    content: fig + ": " + importantFigures[fig],
                    style: defaultText,
                    spacing: 1,
                };
            })
        );
    },

    addHeading: function (roomName, title) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        if (!this.panels) {
            this.panels = {};
        }
        if (!this.panels[roomName] || this.panels[roomName].shouldRedraw) {
            this.panels[roomName] = { shouldRedraw: false, elements: [] };
        }
        this.panels[roomName].elements.push({
            content: title,
            style: defaultText,
            spacing: 1.5,
        });
    },

    finalizePanels: function (roomName, anchor = "right") {
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
        const panelHeight =
            panel.elements.reduce((total, curr) => total + curr.spacing, 0) +
            0.5;
        const panelWidth = 11;
        const x =
            anchor === "left"
                ? -0.5 + panelStyle.strokeWidth / 2
                : 49.5 - panelWidth - panelStyle.strokeWidth / 2;
        const y = -0.5 + panelStyle.strokeWidth / 2;
        const visual = new RoomVisual(roomName).rect(
            x,
            y,
            panelWidth,
            panelHeight,
            panelStyle
        );

        // Add text to the panel for each element
        let offset = 0.5 + panelStyle.strokeWidth / 2;
        for (const element of panel.elements) {
            if (element !== panel.elements[0]) {
                offset += element.spacing;
            }
            visual.text(element.content, x + 0.5, offset, element.style);
        }

        // Mark this panel to redraw
        panel.shouldRedraw = true;
    },

    rects: function (
        positions,
        width = 0.5,
        height = 0.5,
        style = defaultStyle
    ) {
        if (!DEBUG.drawOverlay) {
            return;
        }

        const visuals = {};
        positions.forEach((pos) => {
            if (!visuals[pos.roomName]) {
                visuals[pos.roomName] = new RoomVisual(pos.roomName);
            }
            visuals[pos.roomName].rect(
                pos.x - width / 2,
                pos.y - height / 2,
                width,
                height,
                style
            );
        });
    },

    circles: function (positions, style = defaultStyle) {
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

    visualizeCostMatrix: function (
        roomName,
        matrix,
        excludedValues = [0, 255]
    ) {
        let highestValue = 0;
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                highestValue = Math.max(matrix.get(x, y), highestValue);
            }
        }
        const visual = new RoomVisual(roomName);
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = matrix.get(x, y);
                if (excludedValues.includes(value)) {
                    continue;
                }
                visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: matrixDisplayColor,
                    opacity: value / highestValue,
                });
                visual.text(value, x, y, {
                    font: "0.5 monospace",
                    opacity: 0.8,
                });
            }
        }
    },

    visualizeBasePlan: function (roomName, planMatrix, mapping) {
        const visual = new RoomVisual(roomName);
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = planMatrix.get(x, y);
                const structureType = Object.keys(mapping).find(
                    (s) => mapping[s] === value
                );
                if (structureType) {
                    visual.structure(x, y, structureType);
                }
            }
        }
        visual.connectRoads();
    },
};
