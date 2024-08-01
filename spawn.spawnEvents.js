/**
 * Here we can subscribe to any important colony events that might
 * impact our spawn demands, like the adding or dropping of remotes.
 */

const { roles } = require("./constants");
const { MINER_WORK } = require("./spawn.spawnConstants");
const { MIN_MAX_DEMAND, bumpRoleDemand } = require("./spawn.demandHandler");

const creepMaker = require("./spawn.creepMaker");
const {
    onRemoteAdd,
    onRemoteDrop,
    onRCLUpgrade,
} = require("./event.colonyEvents");

const getDemands = (colony, remote) => {
    const canReserve =
        colony.room.energyCapacityAvailable >= creepMaker.RESERVER_COST;
    const unreservedRatio = canReserve
        ? 1
        : SOURCE_ENERGY_CAPACITY / SOURCE_ENERGY_NEUTRAL_CAPACITY;

    // Quickly roughly calculate how many haulers and miners we'll need
    // to support this remote
    // Note that the above calculates a ratio for unreserved rooms in the case
    // we cannot yet reserve our remotes
    const newHauler = spawnsByRole[roles.hauler](colony);
    const carryPerHauler = newHauler.body.filter((p) => p === CARRY).length;
    const neededCarry = remote.neededCarry / unreservedRatio;
    const neededHaulers = Math.floor(neededCarry / carryPerHauler);

    const newMiner = spawnsByRole[roles.miner](colony);
    const workPerMiner = newMiner.body.filter((p) => p === WORK).length;
    const neededWork = MINER_WORK / unreservedRatio;
    const neededMiners = Math.ceil(neededWork / workPerMiner);

    // Let's also determine if this remote is the only one in its room
    if (!colony.remotePlans) {
        return { neededHaulers, neededMiners, alone: true };
    }
    const sharingRoom = colony.remotePlans.find(
        (r) =>
            // Let's make sure we don't check ourselves
            r.source.id !== remote.source.id &&
            r.active &&
            r.room === remote.room
    );
    return {
        neededHaulers,
        neededMiners,
        alone: !sharingRoom,
    };
};
onRemoteAdd.subscribe((colony, remote) => {
    const { neededHaulers, neededMiners, alone } = getDemands(colony, remote);
    bumpRoleDemand(colony, roles.hauler, neededHaulers, true);
    bumpRoleDemand(colony, roles.miner, neededMiners, true);

    // If this is the only active remote in this room, let's add a reserver
    if (alone) {
        bumpRoleDemand(colony, roles.reserver, 1, true);
    }
});
onRemoteDrop.subscribe((colony, remote) => {
    const { neededHaulers, neededMiners, alone } = getDemands(colony, remote);
    bumpRoleDemand(colony, roles.hauler, -neededHaulers, true);
    bumpRoleDemand(colony, roles.miner, -neededMiners, true);

    // If this was the only active remote in this room, let's remove a reserver
    if (alone) {
        bumpRoleDemand(colony, roles.reserver, -1, true);
    }
});

onRCLUpgrade.subscribe((colony, newRCL) => {
    // Here we'll bump upgrader demand down to make way for new builders
    // we'll do this proportionally to their usage
    const newBuilder = creepMaker.makeBuilder(
        colony.room.energyCapacityAvailable
    );
    const workPerBuilder = newBuilder.body.filter((p) => p === WORK).length;
    const builderUsage =
        workPerBuilder * BUILD_POWER * MIN_MAX_DEMAND[roles.builder].max;

    const newUpgrader = creepMaker.makeUpgrader(
        colony.room.energyCapacityAvailable
    );
    const workPerUpgrader = newUpgrader.body.filter((p) => p === WORK).length;
    const usagePerUpgrader = workPerUpgrader * UPGRADE_CONTROLLER_POWER;

    const upgradersEquivalentToNewBuilders = builderUsage / usagePerUpgrader;
    bumpRoleDemand(colony, roles.upgrader, -upgradersEquivalentToNewBuilders);
});
