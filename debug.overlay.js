const defaultStyle = {
    fill: "#FFFFFF",
};

const defaultText = {
    color: "#FFFFFF",
    align: "left",
    font: "0.7 monospace",
};

const panelTitleText = {
    color: "#FFFFFF",
    align: "left",
    font: "0.9 monospace",
};

const panelStyle = {
    fill: "#000000",
    opacity: 0.35,
    stroke: "#000000",
    strokeWidth: 0.35,
};

const matrixDisplayColor = "#fcba03";

const panels = {};

class Panel {
    constructor(style, anchor) {
        this.style = style;
        this.anchor = anchor;
        this.elements = [];

        this.mx = 0.5;
        this.my = 0.5;
    }

    add(...elements) {
        this.elements.push(...elements);
    }

    draw(roomName) {
        if (this.elements.length <= 1) {
            return;
        }

        const height =
            this.elements.reduce((total, curr) => total + curr.spacing, 0) +
            this.my * 2 -
            // Last element doesn't need a spacing below it
            this.elements.slice(-1)[0].spacing;

        const elementSizes = this.elements.map((element) => {
            if (!element.style || !element.style.font) {
                return 0;
            }
            const scale = parseFloat(
                element.style.font.match(/^\D*(\d+(?:\.\d+)?)/)
            );
            // For some unknown reason, this game has this magic scaling constant
            // of about 1.9 from text to game units
            // No idea why
            return element.content.length * (scale / 1.9);
        });
        const largestElement = elementSizes.reduce((largest, curr) =>
            curr > largest ? curr : largest
        );
        const width = largestElement + this.style.strokeWidth + this.mx * 2;

        const x = this.anchor.includes("r")
            ? 49.5 - width - this.style.strokeWidth / 2
            : -0.5 + this.style.strokeWidth / 2;

        const y = this.anchor.includes("b")
            ? 49.5 - height - this.style.strokeWidth / 2
            : -0.5 + this.style.strokeWidth / 2;

        const visual = new RoomVisual(roomName).rect(
            x,
            y,
            width,
            height,
            this.style
        );

        // Add text to the panel for each element
        let offset = this.my + this.style.strokeWidth / 2;
        for (const element of this.elements) {
            if (element !== this.elements[0]) {
                offset += element.spacing;
            }
            visual.text(element.content, x + this.mx, offset, element.style);
        }
    }
}

/**
 * Creates a panel which can be drawn to.
 * @param {string} name The name of the panel to reference when drawing later.
 * @param {"tr" | "tl" | "br" | "bl"} anchor The side of the screen to anchor the panel.
 */
const createPanel = (name, anchor) => {
    panels[name] = new Panel(panelStyle, anchor);
};

const addHeading = (panelName, heading) => {
    if (!panels[panelName]) {
        return;
    }
    panels[panelName].add({
        content: `- ${heading} -`,
        style: defaultText,
        spacing: 1.5,
    });
};

const addText = (panelName, figures) => {
    if (!panels[panelName]) {
        return;
    }
    panels[panelName].add(
        ...Object.keys(figures).map((fig) => {
            return {
                content: fig + ": " + figures[fig],
                style: defaultText,
                spacing: 1,
            };
        })
    );
};

const finalizePanels = (roomName) => {
    for (const key in panels) {
        panels[key].draw(roomName);
    }
};

module.exports = {
    createPanel,
    addText,
    addHeading,
    finalizePanels,

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

    visualizeBasePlan: function (roomName, planMatrix, rampartMatrix, mapping) {
        const visual = new RoomVisual(roomName);
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = planMatrix.get(x, y);
                if (rampartMatrix.get(x, y)) {
                    visual.structure(x, y, STRUCTURE_RAMPART);
                }
                if (mapping[value]) {
                    visual.structure(x, y, mapping[value]);
                }
            }
        }
        visual.connectRoads();
    },
};
