const RoomInfo = require("./data.roomInfo");
const remoteUtility = require("./remote.remoteUtility");
const { getPlanData, keys } = require("./base.planningUtility");
const profiler = require("./debug.profiler");

class HaulingRequestManager {
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
        profiler.startSample("basic structures");

        const spawnStructuresAndTowers = roomInfo.structures[
            STRUCTURE_SPAWN
        ].concat(roomInfo.structures[STRUCTURE_EXTENSION] || []).concat(
            roomInfo.structures[STRUCTURE_TOWER] || []
        );
        for (const spawnStructure of spawnStructuresAndTowers) {
            const freeCapacity =
                spawnStructure.store.getFreeCapacity(RESOURCE_ENERGY);
            if (!freeCapacity) {
                continue;
            }
            profiler.wrap("create request", () =>
                roomInfo.createDropoffRequest(freeCapacity, RESOURCE_ENERGY, [
                    spawnStructure.id,
                ])
            );
        }
        profiler.endSample("basic structures");
        profiler.startSample("upgraders");
        const upgraderContainer = roomInfo.getUpgraderContainer();
        if (roomInfo.upgraders.length && upgraderContainer) {
            // Request energy for our container
            roomInfo.createDropoffRequest(
                upgraderContainer.store.getFreeCapacity(),
                RESOURCE_ENERGY,
                [upgraderContainer.id]
            );
        }
        profiler.endSample("upgraders");

        // Add miner containers for our base
        profiler.startSample("containers");
        const sourceContainers = getPlanData(
            roomInfo.room.name,
            keys.sourceContainerPositions
        ).map((p) => new RoomPosition(p.x, p.y, roomInfo.room.name));
        for (const containerPos of sourceContainers) {
            const container = containerPos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER);
            roomInfo.createPickupRequest(
                container ? container.store[RESOURCE_ENERGY] : 0,
                RESOURCE_ENERGY,
                SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME,
                true,
                containerPos
            );
        }
        profiler.endSample("containers");

        // Here we'll add all containers as pickup requests, and track remote rooms
        profiler.startSample("remotes");
        if (roomInfo.remotePlans) {
            const importantRooms = new Set();
            importantRooms.add(roomInfo.room.name);

            for (const remote of roomInfo.remotePlans) {
                if (!Game.rooms[remote.room]) {
                    continue;
                }
                const containerPos = new RoomPosition(
                    remote.container.x,
                    remote.container.y,
                    remote.container.roomName
                );
                const container = containerPos
                    .lookFor(LOOK_STRUCTURES)
                    .find((s) => s.structureType === STRUCTURE_CONTAINER);
                roomInfo.createPickupRequest(
                    container ? container.store[RESOURCE_ENERGY] : 0,
                    RESOURCE_ENERGY,
                    SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME,
                    true,
                    containerPos
                );
                importantRooms.add(remote.room);
            }

            // Then, for each remote, let's search and add all dropped resources
            for (const room of importantRooms) {
                const droppedResources = Game.rooms[room].find(
                    FIND_DROPPED_RESOURCES
                );
                for (const dropped of droppedResources) {
                    const hasSourceNeighbour = () => {
                        for (
                            let x = dropped.pos.x - 1;
                            x <= dropped.pos.x + 1;
                            x++
                        ) {
                            for (
                                let y = dropped.pos.y - 1;
                                y <= dropped.pos.y + 1;
                                y++
                            ) {
                                if (x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                                    continue;
                                }
                                if (
                                    Game.rooms[room].lookForAt(
                                        LOOK_SOURCES,
                                        x,
                                        y
                                    )[0]
                                ) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    };

                    roomInfo.createPickupRequest(
                        dropped.amount,
                        dropped.resourceType,
                        Math.ceil(dropped.amount / ENERGY_DECAY),
                        hasSourceNeighbour(),
                        dropped.pos
                    );
                }

                // TODO //
                // Tombstones and ruins
            }
        }
        profiler.endSample("remotes");
    }
}

module.exports = HaulingRequestManager;
