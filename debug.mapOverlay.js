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

module.exports = {
    addText,
};
