const defaultText = {
    color: "#FFFFFF",
    align: "left",
    fontFamily: "monospace",
    fontSize: "8",
};

const addText = (roomName, icon) => {
    Game.map.visual.text(icon, new RoomPosition(0, 5, roomName), defaultText);
};

module.exports = {
    addText,
};
