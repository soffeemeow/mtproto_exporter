import type { Configuration } from "./config.js";
import { filters } from "@mtcute/dispatcher";

export function peersConfigBoolFilter(conf: Configuration, peerId: number) {
    if (conf.excludePeers && conf.excludePeers.includes(peerId)) {
        return false;
    }
    if (conf.includePeers && !conf.includePeers.includes(peerId)) {
        return false;
    }
    return true;
}

export function peersConfigFilter(conf: Configuration) {
    if (conf.excludePeers) {
        return filters.not(filters.chatId(conf.excludePeers));
    } else if (conf.includePeers) {
        return filters.chatId(conf.includePeers);
    }
    return filters.any;
}
