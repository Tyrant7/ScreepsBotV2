module.exports = {

    makeMiner: function(maxCost) {

        // Calculate an average energy produced for sources
        const sourceEnergy = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;

        // Figure out how many WORK parts it will take to harvest this source
        const workCount = (sourceEnergy / HARVEST_POWER) + 1;

        // Make a miner!
        let body = [MOVE, MOVE, MOVE];
        let lvl = 0;
        for (let i = 0; i < workCount; i++) {
            lvl++;
            body.push(WORK);
            if (creepSpawnUtility.getCost(body) > maxCost) {
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
        // Reservers will be made up of 2 CLAIM 2 MOVE bodies
        // It's technically possible with 1 CLAIM 1 MOVE, but give it extra to account for 
        // imperfections in pathing and spawning priorities
        return {
            body: [MOVE, MOVE, CLAIM, CLAIM],
            name: "Reserver " + Game.time + " [2]",
            memory: { role: CONSTANTS.roles.reserver },
        };
    },

    haulerLevelCost: creepSpawnUtility.getCost([MOVE, CARRY, CARRY]),

    
};