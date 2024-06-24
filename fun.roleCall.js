const { roles } = require("./constants");

const roleCall = {
    [roles.upgrader]: "Power For Our God.  Feed. Appease. Pacify.",
    [roles.builder]: "Build It Better.  Build It Right",
    [roles.defender]: "Get Outta Here",
    [roles.miner]: "Extract. Exploit. Earn.",
    [roles.mineralMiner]: "Must Extract",
    [roles.reserver]: "This Belongs To Me!",
    [roles.hauler]: "A Chain Is Only As Strong As Its Weakest Link",
};
const idleTicks = 4;

const doRoleCall = (roomInfo) => {
    for (const role in roleCall) {
        const creeps = roomInfo[role + "s"];
        if (!creeps) {
            continue;
        }
        for (const creep of creeps) {
            const words = roleCall[role].split(" ");
            for (let i = 0; i < idleTicks; i++) {
                words.push("");
            }
            const currentWord = words[Game.time % words.length];
            if (currentWord) {
                creep.say(currentWord, true);
            }
        }
    }
};

module.exports = { doRoleCall };
