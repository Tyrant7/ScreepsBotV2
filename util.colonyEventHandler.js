class ColonyEvent {
    constructor() {
        this.subscribers = [];
    }

    /**
     * Subscribes to this colony event. Callback will be called when event is invoked.
     * @param {(roomName: string, params: any) => void} callback The callback to perform
     * when the event is invoked.
     */
    subscribe(callback) {
        this.subscribers.push(callback);
    }

    /**
     * Invokes a colony event for the given roomName, with the given params.
     * @param {string} roomName The name of the colony to invoke the callback for.
     * @param {any} params Any params to be given to the callback of the event.
     */
    invoke(roomName, params) {
        for (const callback of this.subscribers) {
            callback(roomName, params);
        }
    }
}
