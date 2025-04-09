import type { Dispatcher } from "@mtcute/dispatcher";
import type { TelegramClient } from "@mtcute/node";
import type { Registry } from "prom-client";
import { PropagationAction } from "@mtcute/dispatcher";
import { Counter, Gauge } from "prom-client";

import { config } from "./config.js";
import { peersConfigBoolFilter, peersConfigFilter } from "./filters.js";
import { KeywordsCounter } from "./keywords.js";

function collectNewMessageMetrics(dp: Dispatcher, registry: Registry) {
    const messages = new Counter({
        name: "messenger_dialog_messages_count",
        help: "Messages count since exporter startup",
        labelNames: ["peerId"],
    });

    const media = new Counter({
        name: "messenger_dialog_media_sent_count",
        help: "Medias sent since exporter startup",
        labelNames: ["peerId"],
    });

    const stickers = new Counter({
        name: "messenger_dialog_stickers_sent_count",
        help: "Stickers sent since exporter startup",
        labelNames: ["peerId"],
    });

    const voice = new Counter({
        name: "messenger_dialog_voice_messages_count",
        help: "Voice messages sent since exporter startup",
        labelNames: ["peerId"],
    });

    dp.onNewMessage(peersConfigFilter(config), (msg) => {
        if (msg.media) {
            let counter;
            switch (msg.media.type) {
                case "photo": case "audio": case "document": {
                    counter = media;
                    break;
                }
                case "sticker": {
                    counter = stickers;
                    break;
                }
                case "voice": {
                    counter = voice;
                    break;
                }
                case "video": {
                    if (msg.media.isRound) {
                        counter = voice;
                    } else {
                        counter = media;
                    }
                    break;
                }
            }
            if (counter) {
                counter.inc({
                    peerId: msg.chat.id,
                });
            }
        }

        messages.inc({
            peerId: msg.chat.id,
        });

        return PropagationAction.Continue;
    });

    registry.registerMetric(media);
    registry.registerMetric(stickers);
    registry.registerMetric(voice);
    registry.registerMetric(messages);
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
    collectNewMessageMetrics,
    KeywordsCounter,
    newStaticPeerInfoGauge,
    newUnreadCountGauge,
    newWordsCounter,
};
