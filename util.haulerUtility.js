module.exports = {
    getAssignedDropoffID: function(hauler) {
        if (!hauler.memory.dropoff) {
            return;
        }
        return hauler.memory.dropoff.id;
    },

    getAssignedPickupID: function(hauler) {
        if (!hauler.memory.pickup) {
            return;
        }
        return hauler.memory.pickup.id;
    },
 };