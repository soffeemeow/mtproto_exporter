import type { Dispatcher } from "@mtcute/dispatcher";
import type { Registry } from "prom-client";

import { PropagationAction } from "@mtcute/dispatcher";
import { Counter, Gauge } from "prom-client";

import { config } from "../config.js";
import { peersConfigFilter } from "../filters.js";

export function collectNewMessageMetrics(dp: Dispatcher, registry: Registry) {
    const sendersMap = new Map<number, string>();
    const senderInfo = new Gauge({
        name: "messenger_dialog_sender_info",
        help: "Sender's information exposed as labels",
        labelNames: ["senderId", "displayName"],
        collect: () => {
            senderInfo.reset();
            for (const [senderId, displayName] of sendersMap.entries()) {
                senderInfo.set({ senderId, displayName }, 1);
            }
        },
    });

    let labelNames;
    if (config.messagesCollector.includeSender) {
        labelNames = ["peerId", "senderId"];
    } else {
        labelNames = ["peerId"];
    }

    const messages = new Counter({
        name: "messenger_dialog_messages_count",
        help: "Messages count since exporter startup",
        labelNames,
    });

    const media = new Counter({
        name: "messenger_dialog_media_sent_count",
        help: "Medias sent since exporter startup",
        labelNames,
    });

    const stickers = new Counter({
        name: "messenger_dialog_stickers_sent_count",
        help: "Stickers sent since exporter startup",
        labelNames,
    });

    const voice = new Counter({
        name: "messenger_dialog_voice_messages_count",
        help: "Voice messages sent since exporter startup",
        labelNames,
    });

    dp.onNewMessage(peersConfigFilter(config), (msg) => {
        let labelValues;
        if (config.messagesCollector.includeSender) {
            sendersMap.set(msg.sender.id, msg.sender.displayName);

            labelValues = {
                peerId: msg.chat.id,
                senderId: msg.sender.id,
            };
        } else {
            labelValues = {
                peerId: msg.chat.id,
            };
        }

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
                counter.inc(labelValues);
            }
        }

        messages.inc(labelValues);
        return PropagationAction.Continue;
    });

    if (config.messagesCollector.includeSender) {
        registry.registerMetric(senderInfo);
    }
    registry.registerMetric(media);
    registry.registerMetric(stickers);
    registry.registerMetric(voice);
    registry.registerMetric(messages);
}
