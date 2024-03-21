Creep.prototype.moveTo = function(target, options = { range: 1 }) {
    if (!(target instanceof RoomPosition)) {
        target = target.pos;
    }

    // If we don't have a path already, let's generate one
    let moveData = this.memory._smartMove;
    if (!moveData ||
        !(target.x === moveData.dest.x && target.y === moveData.dest.y && target.roomName === moveData.dest.roomName) || 
        !moveData.lastPos.roomName === this.pos.roomName || 
        !moveData.path) {
        moveData = generatePathTo(this, { pos: target, range: options.range });
        this.memory._smartMove = moveData;
    }

    // Move and advance our path
    const p = this.pos;
    if (p.x !== moveData.lastPos.x || p.y !== moveData.lastPos.y) {
        moveData.path = moveData.path.substring(1);
    }
    this.move(moveData.path[0]);
    moveData.lastPos = this.pos;
}

const cachedCostMatrices = {};

function getCostMatrix(roomName) {
    const cached = cachedCostMatrices[roomName];
    if (cached && cached.tick === Game.time) {
        return cachedCostMatrices[roomName].matrix;
    }

    const room = Game.rooms[roomName];
    const costs = new PathFinder.CostMatrix;
    if (!room) {
        return costs;
    }

    room.find(FIND_STRUCTURES).forEach((s) => {

        if (s.structureType === STRUCTURE_ROAD) {
            costs.set(s.pos.x, s.pos.y, 1);
        }
        else if (s.structureType !== STRUCTURE_CONTAINER &&
                (s.structureType !== STRUCTURE_RAMPART || !s.my)) {
            costs.set(s.pos.x, s.pos.y, 255);
        }
    });
    cachedCostMatrices[roomName] = { matrix: costs, tick: Game.time };
    return costs;
}

function generatePathTo(creep, target) {
    const result = PathFinder.search(creep.pos, target, {
        plainCost: 2,
        swampCost: 10,
        roomCallback: getCostMatrix,
    })
    let path = "";
    let lastPos = creep.pos;
    for (const pos of result.path) {
        path = path.concat(lastPos.getDirectionTo(pos));
        lastPos = pos;

        // We can cut our position when we hit a new room since we'll regenerate 
        // the path when entering anyway
        if (pos.roomName !== lastPos.roomName) {
            console.log("early");
            break;
        }
    }

    console.log("new path: " + creep.name);
    console.log(path);

    return {
        dest: target.pos,
        path: path,
        lastPos: creep.pos,
    };
}