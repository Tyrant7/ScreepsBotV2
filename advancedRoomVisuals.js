const RoomInfo = require("roomInfo");

const anchors = {
    topLeft: [-1, -1],
    midLeft: [-1, 0],
    bottomLeft: [-1, 1],
    topCentre: [0, -1],
    midCentre: [0, 0],
    bottomCentre: [0, 1],
    topRight: [1, -1],
    midRight: [1, 0],
    bottomRight: [1, 1]
}

const config = {
    panelColour: "#000008",
    panelBorder: "#000000",
    panelBorderWidth: 0.2,
    titleColour: "#DDDDDD",
};

class AdvancedRoomVisuals {

    constructor(roomInfo) {       
        try {
            this.info = roomInfo;

            // Start off with our panel
            const panelWidth = 10;
            const panelHeight = 10;

            // const panel = this.drawPanel(anchors.topRight, panelWidth, panelHeight);
            // const title = this.drawTitle("Stats", anchors.topCentre, panel);

            for (const a in anchors) {
                const panel = this.drawPanel(anchors[a], panelWidth, panelHeight);
                for (const b in anchors) {
                    const nestedPanel = this.drawPanel(anchors[b], 2, 2, panel);
                    // const title = this.drawTitle("Stats", anchors[b], panel);
                }
            }
        }
        catch (e) {
            console.log("Error while drawing visual: " + e);
        }
    }

    getAnchoredPos(anchor, width, height, parent) {

        // Anchor to our parent if one was provided, otherwise use the room
        const pWidth = parent ? parent.width / 2 : 25;
        const pHeight = parent ? parent.height / 2 : 25;
        const pX = parent ? parent.x : 0;
        const pY = parent ? parent.y : 0;

        let x = pX + (anchor[0] * pWidth + pWidth);
        let y = pY + (anchor[1] * pHeight + pHeight);

        const offsetX = parent ? 0 : 0.5;
        const offsetY = parent ? 0 : 0.5;
        x -= width / 2 * x / pWidth + offsetX;
        y -= height / 2 * y / pHeight + offsetY;

        return { x: x, y: y };
    }

    drawPanel(anchor, width, height, parent = null) {

        const anchorPos = this.getAnchoredPos(anchor, width, height, parent);
        this.info.room.visual.rect(anchorPos.x, anchorPos.y, width, height, 
            { fill: config.panelColour, stroke: config.panelBorder, strokeWidth: config.panelBorderWidth });

        return {
            x: anchorPos.x + width / 2,
            y: anchorPos.y + height / 2,
            width: width,
            height: height,
        };
    }

    drawTitle(title, anchor, parent = null, margin = 1) {

        const anchorPos = this.getAnchoredPos(anchor, 0, 0, parent);
        anchorPos.x += anchor[0] > 0 ? -margin : anchor[0] < 0 ? margin : 0;
        anchorPos.y += anchor[1] > 0 ? -margin : anchor[1] < 0 ? margin : 0;

        this.info.room.visual.text(title, anchorPos.x, anchorPos.y, { color: config.titleColour });
    }
}

module.exports = AdvancedRoomVisuals;