class RemotePlanner {

    planRemotes(roomInfo) {

        // Remotes can't have remotes
        if (roomInfo.dependant !== roomInfo.room.name) {
            return;
        }

        
    }

    createRemote() {

    }
}

module.exports = RemotePlanner;