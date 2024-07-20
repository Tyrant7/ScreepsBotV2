const defaultText = {
    color: "#FFFFFF",
    align: "left",
    fontFamily: "monospace",
    fontSize: "8",
};

const addText = (roomName, text) => {
    Game.map.visual.text(text, new RoomPosition(0, 5, roomName), defaultText);
};

module.exports = {
    addText,
};
