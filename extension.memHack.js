const cachedMemory = Memory;

const doMemhack = () => {
    delete global.Memory;
    global.Memory = cachedMemory;
    RawMemory._parsed = cachedMemory;
};

module.exports = { doMemhack };
