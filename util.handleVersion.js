/**
 * Determines if the memory created by the previous version of this bot is
 * compatible with the current version. If it isn't, resets the current bot's memory.
 * Major versions are always incompatible.
 * Minor versions are always incompatible.
 * Patches are always compatible.
 * @param {string} version The current version of our bot.
 */
const handleVersion = (version) => {
    const versionParts = version.split(".");
    const previousVersionParts = (Memory.version || "1.0.0").split(".");
    if (versionParts[0] !== previousVersionParts[0]) {
        console.log(
            "Current major version does not match old major version! Updating version number and clearing incompatible memory..."
        );
        Memory = { version };
        Game.cpu.halt();
        return;
    }
    if (versionParts[1] !== previousVersionParts[1]) {
        console.log(
            "Current minor version does not match old minor version! Updating version number and clearing incompatible memory..."
        );
        Memory = { version };
        Game.cpu.halt();
        return;
    }
    if (versionParts[2] !== previousVersionParts[2]) {
        console.log(
            "Current patch does not match old patch! Updating version number..."
        );
        Memory.version = version;
    }
};

module.exports = handleVersion;
