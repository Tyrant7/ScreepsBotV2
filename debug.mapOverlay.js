const { ROOM_SIZE } = require("./constants");
const { roomNameToXY } = require("./util.roomNameToXY");

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

const drawArrow = (
    toRoom,
    fromRoom,
    styling = {
        width: 1,
        color: "#FFFFFF",
    }
) => {
    const offshootStyling = { ...styling, lineStyle: undefined };

    // Main arrow body
    Game.map.visual.line(
        new RoomPosition(25, 25, toRoom),
        new RoomPosition(25, 25, fromRoom),
        styling
    );

    const toRoomXY = roomNameToXY(toRoom);
    const fromRoomXY = roomNameToXY(fromRoom);
    const dx = toRoomXY.xx - fromRoomXY.xx;
    const dy = toRoomXY.yy - fromRoomXY.yy;

    const offshootLength = 6;
    const theta = Math.atan2(dy, dx);

    const angle = 35;
    const rad = angle * (Math.PI / 180);
    const x = 25 - offshootLength * Math.cos(theta + rad);
    const y = 25 - offshootLength * Math.sin(theta + rad);

    const phi2 = -angle * (Math.PI / 180);
    const x2 = 25 - offshootLength * Math.cos(theta + phi2);
    const y2 = 25 - offshootLength * Math.sin(theta + phi2);

    // Offshoots
    Game.map.visual.line(
        new RoomPosition(25, 25, toRoom),
        new RoomPosition(x, y, toRoom),
        offshootStyling
    );
    Game.map.visual.line(
        new RoomPosition(25, 25, toRoom),
        new RoomPosition(x2, y2, toRoom),
        offshootStyling
    );
};

module.exports = {
    addText,
    drawArrow,
};
