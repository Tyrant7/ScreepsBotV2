const defaultText = {
    color: "#FFFFFF",
    align: "left",
    fontFamily: "monospace",
    fontSize: "8",
};

const addText = (roomName, text, colour = "#FFFFFF") => {
    Game.map.visual.text(text, new RoomPosition(0, 5, roomName), {
        ...defaultText,
        color: colour,
    });
};

const drawArrow = (room1, room2, colour = "#FFFFFF", lineStyle = undefined) => {
    Game.map.visual.line(
        new RoomPosition(25, 25, room1),
        new RoomPosition(25, 25, room2),
        {
            width: 1,
            color: colour,
            lineStyle: lineStyle,
        }
    );
};

module.exports = {
    addText,
    drawArrow,
};
