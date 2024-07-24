const { pathSets } = require("./constants");
const BuilderManager = require("./creep.builder");
const Task = require("./data.task");

class ColonizerBuilderManager extends BuilderManager {
    createTask(creep, colony) {
        if (creep.memory.expansionTarget === creep.room.name) {
            if (creep.room.controller.my) {
                creep.memory.home = creep.room.name;
                return this.developmentLogisics(creep, colony);
            }
            // We'll wait until our room has been claimed
            return;
        }
        return this.createMoveTask(creep);
    }

    developmentLogisics(creep, colony) {
        const spawnSite = colony.constructionSites.find(
            (s) => s.structureType === STRUCTURE_SPAWN
        );
        if (spawnSite) {
            if (creep.store[RESOURCE_ENERGY] === 0 || creep.memory.sourceID) {
                if (!creep.memory.sourceID) {
                    const resourcePile = colony.room
                        .find(FIND_DROPPED_RESOURCES)
                        .find(
                            (r) =>
                                r.resourceType === RESOURCE_ENERGY &&
                                r.amount >= creep.store.getCapacity()
                        );
                    if (resourcePile) {
                        return this.createPickupTask(creep, resourcePile);
                    }
                }
                return this.createHarvestTask(creep, colony);
            }
            return super.createBuildTask(colony, creep, spawnSite, true);
        }
        // Our spawn isn't built yet, start harvesting while we wait for the site to get placed
        if (!colony.structures[STRUCTURE_SPAWN]) {
            return this.createHarvestTask(creep, colony);
        }
        return this.createUpgradeTask(colony);
    }

    createPickupTask(creep, pickup) {
        const actionStack = [
            function (creep, { pickupID }) {
                const target = Game.getObjectById(pickupID);
                if (!target || creep.store.getFreeCapacity() === 0) {
                    return true;
                }
                if (creep.pos.getRangeTo(target.pos) > 1) {
                    creep.betterMoveTo(target, {
                        range: 1,
                        maxRooms: 1,
                        pathSet: pathSets.default,
                    });
                    return false;
                }
                creep.pickup(pickup);
            },
        ];
        return new Task({ pickupID: pickup.id }, "pickup", actionStack);
    }

    createHarvestTask(creep, colony) {
        const actionStack = [
            function (creep, { targetID }) {
                if (creep.store.getFreeCapacity() === 0) {
                    delete creep.memory.sourceID;
                    return true;
                }
                const source = Game.getObjectById(targetID);
                if (creep.pos.getRangeTo(source.pos) > 1) {
                    creep.betterMoveTo(source, {
                        range: 1,
                        maxRooms: 1,
                        pathSet: pathSets.default,
                    });
                    return false;
                }
                creep.harvest(source);
            },
        ];

        // We can save a lot of CPU by computing this once and caching the result
        if (!creep.memory.sourceID) {
            // Filter all sources that aren't reserved yet
            const unreservedSources = colony.sources.filter(
                (s) =>
                    !colony.colonizerBuilders.find(
                        (b) => b.memory.sourceID === s.id
                    )
            );
            // We'll wait until we have somewhere to mine
            if (!unreservedSources.length) return;
            const { goal: closestSource, path } = creep.betterFindClosestByPath(
                unreservedSources,
                {
                    range: 1,
                    maxRooms: 1,
                    pathSet: pathSets.default,
                }
            );
            creep.injectPath(closestSource.pos, path);
            creep.memory.sourceID = closestSource.id;
        }
        return new Task(
            { targetID: creep.memory.sourceID },
            "harvest",
            actionStack
        );
    }

    createUpgradeTask(colony) {
        const actionStack = [
            function (creep, data) {
                if (creep.pos.getRangeTo(creep.room.controller.pos) > 3) {
                    creep.betterMoveTo(creep.room.controller, { range: 3 });
                    return false;
                }
                creep.upgradeController(creep.room.controller);
                colony.createDropoffRequest(
                    Infinity,
                    RESOURCE_ENERGY,
                    creep.id
                );
                if (colony.room.controller.level >= 2) {
                    return true;
                }
            },
        ];
        return new Task({}, "upgrade", actionStack);
    }

    createMoveTask(creep) {
        const actionStack = [this.basicActions.moveToRoom];
        return new Task(
            {
                roomName: creep.memory.expansionTarget,
                maxRooms: 64,
                maxOps: 64000,
            },
            "move",
            actionStack
        );
    }
}

module.exports = ColonizerBuilderManager;
