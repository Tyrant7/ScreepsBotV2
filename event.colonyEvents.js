const ColonyEvent = require("./util.colonyEvent");
const onRemoteAdd = new ColonyEvent();
const onRemoteDrop = new ColonyEvent();

const onRCLUpgrade = new ColonyEvent();

module.exports = { onRemoteAdd, onRemoteDrop, onRCLUpgrade };
