const RemoteManager = require("remoteManager");
const remoteManager = new RemoteManager();

class EconomyManager {

    run(roomInfo) {

        //
        // Responsibility list for EconomyManager
        // 

        //
        // Overall idea: 
        // Keep us stable while honing in on our max economic output
        //


        // When remotes are planned

        // 1. 
        // Create some basic estimates
        // Estimate how which remotes we can have active based on our current economy
        // -> let's start off our running average at this estimated value
        // -> these values will generally be lower than in reality, so we'll drop our worst remotes over time

        // 2.
        // Estimate main room as well
        // Also estimate our main room's spawn usage for things like energy distribution, building, and mining
        // This estimation can be much rougher, since it will change a lot depending on things like
        // storage fullness, construction, military activity, and other room-state things


        // Every tick:

        // 1.
        // Track our spawns
        // Run the spawn manager and spawn everything necessary to support what's currently active

        // 2.
        // Track our spawn usage
        // Spawn manager should return some info about our average spawn usage
        // Every once and a while, let's compare this to our estimates
        // -> if we're in a safe situation (no attackers and consistent energy flow),
        //    let's nudge our estimates towards the actual value
        // -> we should hone in on our actual max over time
        // -> if we're in an unsafe situation (attackers or spawning lots of large creeps
        //    for one reason or another), we should form a new estimation based on that and drop our
        //    current estimates accordingly

        // 3. 
        // Manage our remotes
        // Based on our new estimates, we should be able to add/drop remotes accordingly
        // that we can or can no longer support in order to stay on top of our economy
    }
}

module.exports = EconomyManager;