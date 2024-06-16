const ColonyEvent = require("./util.colonyEvent");
const onRemoteAdd = new ColonyEvent();
const onRemoteDrop = new ColonyEvent();

module.exports = { onRemoteAdd, onRemoteDrop };
