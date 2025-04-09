import type { Dialog, TelegramClient } from "@mtcute/node";

import type { Registry } from "prom-client";
import process from "node:process";

import timers from "node:timers/promises";
import { Gauge } from "prom-client";
import { config } from "../config.js";
import { peersConfigBoolFilter } from "../filters.js";

export function collectDialogMetrics(tg: TelegramClient, registry: Registry) {
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
