/**
 * @typedef {Object} SpawnGroup A spawn group is responsible for spawning creeps that complete a
 * specific goal for our colony, like harvesting energy, transport, or spending.
 * @property {() => number} getPriority Function to determine priority of this group.
 * @property {SpawnProfiles[]} profiles The spawn profiles for this group in order of priority.
 */

/**
 * @typedef {Object} SpawnProfiles A spawn profiles is an object that contains all necessary information
 * about spawning a particular type of creep.
 * @property {(colony, set, nudge, bump) => void} handleDemand Handles determining spawn demand for this creep in
 * the given colony. Demand can be modified instantaneously through a `set` command, spiked in a particular direction
 * using a `bump` command, or gradually slid in a direction with a `nudge` command.
 * @property {(colony) => } make Handles creation of the spawn request for this type of creep.

/**
 * @typedef SpawnRequest An object with a creep body, name, and initial memory for the newly planned creep.
 * @property {BodyPartConstant[]} body The body parts for the new creep.
 * @property {string} name The name of the new creep.
 * @property {{ role: string }} memory An object with any data needed to initialize the creep. Strongly recommend
 * to include the creep's role.
 */

