const creepSpawnUtility = require("creepSpawnUtility");

// Figure out how many WORK parts it will take to fully harvest a source before it regens
const MINER_WORK = (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME / HARVEST_POWER) + 1;

module.exports = {
    
    //#region Energy Production

    makeMiner: function(energy) {

        // Make a miner!
        let body = [MOVE, MOVE, MOVE];
        let lvl = 0;
        for (let i = 0; i < MINER_WORK; i++) {
            lvl++;
            body.push(WORK);
            if (creepSpawnUtility.getCost(body) > energy) {
                lvl--;
                body.pop();
                break;
            }
        }
        return { body: body, 
                 name: "Miner " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.miner }};
    },

    makeHauler: function(desiredLevel, energy) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, CARRY, CARRY);
            if (creepSpawnUtility.getCost(body) > energy || body.length > 50) {
                body.pop();
                body.pop();
                body.pop();
                break;
            } 
        }
        return { body: body, 
                 name: "Hauler " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.hauler }};
    },

    makeReserver: function() {
        // It's technically possible with 1 CLAIM 1 MOVE, but give it extra to account for 
        // imperfections in pathing and spawning priorities
        return {
            body: [MOVE, MOVE, CLAIM, CLAIM],
            name: "Reserver " + Game.time + " [2]",
            memory: { role: CONSTANTS.roles.reserver },
        };
    },

    //#endregion

    //#region Development

    makeUpgrader: function(desiredLevel, energy) {
        let body = [CARRY, CARRY];
        let lvl = 0;
        while (lvl < desiredLevel) {
            lvl++;
            body.push(...[MOVE, WORK, WORK, WORK, WORK]);
            if (creepSpawnUtility.getCost(body) > energy || body.length > 50) {
                lvl--;
                body.pop();
                body.pop();
                body.pop();
                body.pop();
                body.pop();
                break;
            }
        }
        return { body: body, 
                 name: "Upgrader " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.upgrader }};
    },

    makeBuilder: function(desiredLevel, energy) {
        const builderParts = [WORK, CARRY, MOVE];
        let body = builderParts;
        let lvl = 1;
        const levelCost = creepSpawnUtility.getCost(body);
        while (lvl < desiredLevel && (lvl + 1) * levelCost <= energy && body.length <= 50 - builderParts.length) {
            lvl++;
            body = body.concat(builderParts);
        }
        return { body: body,
                 name: "Builder " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.builder }};
    },


    makeRepairer: function(desiredLevel, energy) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, CARRY, CARRY, WORK);
            if (creepSpawnUtility.getCost(body) > energy) {
                body.pop();
                body.pop();
                body.pop();
                body.pop();
                break;
            } 
        }
        return { body: body, 
                 name: "Repairer " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.repairer }};
    },

    //#endregion

    //#region Expansion

    makeScout: function() {
        return { body: [MOVE], 
            name: "Scout " + Game.time + " [1]",
            memory: { role: CONSTANTS.roles.scout }};
    },

    //#endregion

    //#region Defense

    makeMiniDefender: function(desiredLevel, maxCost) {
        let body = [];
        let lvl = 0;
        for (let i = 0; i < desiredLevel; i++) {
            lvl = i + 1;
            body.push(MOVE, RANGED_ATTACK, RANGED_ATTACK, MOVE, RANGED_ATTACK, HEAL);
            if (creepSpawnUtility.getCost(body) > maxCost) {
                for (let i = 0; i < 6; i++) {
                    body.pop();
                }
                break;
            } 
        }
        return { body: body, 
                 name: "Baby_Defender " + Game.time + " [" + lvl + "]",
                 memory: { role: CONSTANTS.roles.defender }};
    },

    //#endregion
}