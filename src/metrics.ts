import type { Dispatcher } from "@mtcute/dispatcher";
import type { Dialog, TelegramClient } from "@mtcute/node";
import type { Registry } from "prom-client";

import process from "node:process";
import timers from "node:timers/promises";

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

class DialogsHolder {
    private lastUpdate = 0n;
    private dialogs: Dialog[] = [];
    private isUpdating = false;
    private ttl: bigint;

    constructor(private tg: TelegramClient, ttl: number, private timeout: number, private pollInterval = 10) {
        this.ttl = BigInt(ttl) * 1000000n;
    }

    public async get() {
        if (this.isUpdating) {
            for (let i = 0; i < this.timeout && this.isUpdating; i += this.pollInterval) {
                await timers.setTimeout(this.pollInterval);
            }
            if (this.isUpdating) {
                throw new Error("Timed out fetching dialogs");
            }
        }
        if (process.hrtime.bigint() - this.lastUpdate > this.ttl) {
            this.isUpdating = true;
            this.dialogs = [];
            for await (const d of this.tg.iterDialogs()) {
                if (!peersConfigBoolFilter(config, d.peer.id)) {
                    continue;
                }
                this.dialogs.push(d);
            }
            this.lastUpdate = process.hrtime.bigint();
            this.isUpdating = false;
        }
        return this.dialogs;
    }
}

function collectDialogMetrics(tg: TelegramClient, registry: Registry) {
    const dialogs = new DialogsHolder(tg, 1000, 5000);

    const info = new Gauge({
        name: "messenger_dialog_info",
        help: "Dialog information exposed as labels",
        labelNames: ["peerId", "peerType", "displayName"],
        collect: async () => {
            info.reset();
            for (const d of await dialogs.get()) {
                info.set({
                    peerId: d.peer.id,
                    peerType: d.peer.type,
                    displayName: d.peer.displayName,
                }, 1);
            }
        },
    });

    const unread = new Gauge({
        name: "messenger_dialog_unread_messages_count",
        help: "Number of unread messages in dialogs",
        labelNames: ["peerId"],
        collect: async () => {
            unread.reset();
            for (const d of await dialogs.get()) {
                unread.set({
                    peerId: d.peer.id,
                }, d.unreadCount);
            }
        },
    });

    registry.registerMetric(info);
    registry.registerMetric(unread);
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
    collectDialogMetrics,
    collectNewMessageMetrics,
    KeywordsCounter,
    newWordsCounter,
};
