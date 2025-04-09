import type { Dispatcher } from "@mtcute/dispatcher";
import type { Registry } from "prom-client";

import { PropagationAction } from "@mtcute/dispatcher";
import { Counter } from "prom-client";

import { config } from "../config.js";
import { peersConfigFilter } from "../filters.js";

export function collectNewMessageMetrics(dp: Dispatcher, registry: Registry) {
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
