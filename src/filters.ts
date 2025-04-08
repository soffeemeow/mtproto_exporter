import { filters } from "@mtcute/dispatcher";
import { Configuration } from "./config.js";

export function peersConfigBoolFilter(conf: Configuration, peerId: number) {
    if(conf.excludePeers && conf.excludePeers.indexOf(peerId) !== -1) {
        return false;
    }
    if(conf.includePeers && conf.includePeers.indexOf(peerId) === -1) {
        return false;
    }
    return true;
}

export function peersConfigFilter(conf: Configuration) {
    if(conf.excludePeers) {
        return filters.not(filters.chatId(conf.excludePeers));
    } else if (conf.includePeers) {
        return filters.chatId(conf.includePeers);
    }
    return filters.any;
}