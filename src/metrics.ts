import type { Dispatcher } from "@mtcute/dispatcher";
import type { TelegramClient } from "@mtcute/node";
import { PropagationAction } from "@mtcute/dispatcher";
import { Counter, Gauge } from "prom-client";

import { config } from "./config.js";
import { peersConfigBoolFilter, peersConfigFilter } from "./filters.js";
import { KeywordsCounter } from "./keywords.js";

function newMessagesCounter(dp: Dispatcher) {
    const counter = new Counter({
        name: "messenger_dialog_messages_count",
        help: "Messages count since exporter startup",
        labelNames: ["peerId"],
    });

    dp.onNewMessage(peersConfigFilter(config), async (msg) => {
        counter.inc({
            peerId: msg.chat.id,
        });
        return PropagationAction.Continue;
    });
    return counter;
}

function newStaticPeerInfoGauge(tg: TelegramClient) {
    const gauge = new Gauge({
        name: "messenger_dialog_info",
        help: "Dialog information exposed as labels",
        labelNames: ["peerId", "peerType", "displayName"],
        collect: async () => {
            gauge.reset();
            for await (const d of tg.iterDialogs()) {
                if (!peersConfigBoolFilter(config, d.peer.id)) {
                    continue;
                }

                gauge.set({
                    peerId: d.peer.id,
                    peerType: d.peer.type,
                    displayName: d.peer.displayName,
                }, 1);
            }
        },
    });
    return gauge;
}

function newUnreadCountGauge(tg: TelegramClient) {
    const gauge = new Gauge({
        name: "messenger_dialog_unread_messages_count",
        help: "Number of unread messages in dialogs",
        labelNames: ["peerId"],
        collect: async () => {
            gauge.reset();
            for await (const d of tg.iterDialogs()) {
                if (!peersConfigBoolFilter(config, d.peer.id)) {
                    continue;
                }

                gauge.set({
                    peerId: d.peer.id,
                }, d.unreadCount);
            }
        },
    });
    return gauge;
}

function newWordsCounter(dp: Dispatcher) {
    const counter = new Counter({
        name: "messenger_dialog_words_count",
        help: "Number of words in messages since exporter startup",
        labelNames: ["peerId", "word"],
    });
    dp.onNewMessage(peersConfigFilter(config), async (msg) => {
        const words = msg.text.toLowerCase().split(" ");
        for (const w of words) {
            counter.inc({
                peerId: msg.chat.id,
                word: w,
            });
        }
        return PropagationAction.Continue;
    });
    return counter;
}

export {
    KeywordsCounter,
    newMessagesCounter,
    newStaticPeerInfoGauge,
    newUnreadCountGauge,
    newWordsCounter,
};
