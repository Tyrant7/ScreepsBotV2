// Function to convert room name to coords taken from Screeps Engine
const roomNameToXY = (name) => {
    let xx = parseInt(name.substr(1), 10);
    let verticalPos = 2;
    if (xx >= 100) {
        verticalPos = 4;
    } else if (xx >= 10) {
        verticalPos = 3;
    }
    let yy = parseInt(name.substr(verticalPos + 1), 10);
    let horizontalDir = name.charAt(0);
    let verticalDir = name.charAt(verticalPos);
    if (horizontalDir === "W" || horizontalDir === "w") {
        xx = -xx - 1;
    }
    if (verticalDir === "N" || verticalDir === "n") {
        yy = -yy - 1;
    }
    return { xx, yy };
};

module.exports = {
    roomNameToXY,
};
