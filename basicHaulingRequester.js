const RoomInfo = require("./roomInfo");
const remoteUtility = require("./remoteUtility");

class BasicHaulingRequester {

    /**
     * Creates some basic requests for a colony, including:
     * Dropoff requests:
     * - Spawns and extensions
     * Pickup requests:
     * - Miner containers + overflow
     * - Dropped energy
     * - Ruins
     * - Tombstones
     * @param {RoomInfo} roomInfo The base to create requests for.
     */
    generateBasicRequests(roomInfo) {

        const spawnStructures = roomInfo.room.find(FIND_STRUCTURES, { 
            filter: (s) => s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN 
        });
        for (const spawnStructure of spawnStructures) {
            roomInfo.createDropoffRequest(
                spawnStructure.store.getFreeCapacity(RESOURCE_ENERGY),
                RESOURCE_ENERGY,
                [spawnStructure.id],
            );
        }
        const upgraderContainer = roomInfo.getUpgraderContainer();
        if (upgraderContainer) {
            // Request energy for our container
            roomInfo.createDropoffRequest(
                upgraderContainer.store.getFreeCapacity(),
                RESOURCE_ENERGY,
                [upgraderContainer.id],
            );
        }

        const base = Memory.bases[roomInfo.room.name];
        for (const sourceID in base.minerContainers) {
            const containerPos = base.minerContainers[sourceID];
            const realPos = new RoomPosition(containerPos.x, containerPos.y, containerPos.roomName);
            const container = containerPos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER);
            roomInfo.createPickupRequest(
                container ? container.store[RESOURCE_ENERGY] : 0,
                RESOURCE_ENERGY,
                SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME,
                true,
                containerPos,
            );
        }

        // Here we'll add all containers as pickup requests, and track remote rooms
        const importantRooms = new Set();
        importantRooms.add(roomInfo.room.name);
        const remotes = remoteUtility.getRemotePlans(roomInfo.room.name);
        for (const remote of remotes) {
            const containerPos = new RoomPosition(remote.container.x, remote.container.y, remote.container.roomName);
            const container = containerPos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER);
            roomInfo.createPickupRequest(
                container ? container.store[RESOURCE_ENERGY] : 0,
                RESOURCE_ENERGY,
                SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME,
                true,
                containerPos,
            );
            importantRooms.add(remote.room);
        }

        // Then, for each remote, let's search and add all dropped resources
        // Dropped energy should combine automatically with the container's request if it's on the same time
        for (const remoteRoom of importantRooms) {
            if (!Game.rooms[remoteRoom]) {
                continue;
            }
            const droppedResources = Game.rooms[remoteRoom].find(FIND_DROPPED_RESOURCES);
            for (const dropped of droppedResources) {
                roomInfo.createPickupRequest(
                    dropped.amount,
                    dropped.resourceType,
                    Math.ceil(dropped.amount / ENERGY_DECAY),
                    false,
                    dropped.pos,
                );
            }

            // TODO //
            // Tombstones and ruins
        }
    }
}

module.exports = BasicHaulingRequester;