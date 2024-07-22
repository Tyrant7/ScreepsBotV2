const { ROOM_SIZE } = require("./constants");
const { roomNameToXY } = require("./scouting.scoutingUtility");

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
    colour = "#FFFFFF",
    lineStyle = undefined
) => {
    const styling = {
        width: 1,
        color: colour,
        lineStyle: lineStyle,
    };

    // Main arrow body
    Game.map.visual.line(
        new RoomPosition(25, 25, toRoom),
        new RoomPosition(25, 25, fromRoom),
        styling
    );

    const toRoomXY = roomNameToXY(toRoom);
    const fromRoomXY = roomNameToXY(fromRoom);
    toRoomXY.xx *= ROOM_SIZE;
    toRoomXY.yy *= ROOM_SIZE;
    fromRoomXY.xx *= ROOM_SIZE;
    fromRoomXY.yy *= ROOM_SIZE;

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

    console.log(x + ": " + y);
    console.log(x2 + ": " + y2);

    // Offshoots
    Game.map.visual.line(
        new RoomPosition(25, 25, toRoom),
        new RoomPosition(x, y, toRoom),
        styling
    );
    Game.map.visual.line(
        new RoomPosition(25, 25, toRoom),
        new RoomPosition(x2, y2, toRoom),
        styling
    );
};

module.exports = {
    addText,
    drawArrow,
};
