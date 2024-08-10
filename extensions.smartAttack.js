Creep.prototype.smartAttack = function (target) {
    for (const part of this.body) {
        if (part.type === WORK) return this.dismantle(target);
        if (part.type === ATTACK) return this.attack(target);
        if (part.type === RANGED_ATTACK) return this.rangedAttack(target);
    }
};
