import type { Dispatcher } from "@mtcute/dispatcher";
import type { TelegramClient, tl } from "@mtcute/node";

import type { Registry } from "prom-client";
import { setTimeout } from "node:timers/promises";
import { PropagationAction } from "@mtcute/dispatcher";
import { Counter, Gauge } from "prom-client";
import { config } from "../config.js";
import { peersConfigBoolFilter, peersConfigFilter } from "../filters.js";

type ReactionsMap = Map<string, number>;
type MessageReactionsMap = Map<number, ReactionsMap>;
type PeerMessagesMap = Map<number, MessageReactionsMap>;

function getRawPeerId(peer: tl.TypePeer) {
    switch (peer._) {
        case "peerUser": {
            return peer.userId;
        }
        case "peerChat": {
            return peer.chatId;
        }
        case "peerChannel": {
            return peer.channelId;
        }
    }
}

function getRawReactionEmoji(reaction: tl.TypeReaction) {
    let emojiId: string;
    let emojiName: string;
    switch (reaction._) {
        case "reactionEmoji": {
            emojiId = reaction.emoticon;
            emojiName = reaction.emoticon;
            break;
        }
        case "reactionCustomEmoji": {
            emojiId = `<custom:${reaction.documentId.toString()}>`;
            emojiName = "<custom>";
            break;
        }
        case "reactionPaid": {
            emojiId = "<star_paid>";
            emojiName = "⭐ (Paid)";
            break;
        }
        case "reactionEmpty": {
            emojiId = "<empty>";
            emojiName = "<empty>";
            break;
        }
    }
    return { id: emojiId, name: emojiName };
}

function getEmojiNameFromId(id: string) {
    if (id === "<star_paid>") {
        return "⭐ (Paid)";
    }
    if (id.startsWith("<custom:")) {
        return "<custom>";
    }
    return id;
}

export async function collectReactionsMetrics(tg: TelegramClient, dp: Dispatcher, registry: Registry) {
    const peers: PeerMessagesMap = new Map();

    const set = new Counter({
        name: "messenger_dialog_reactions_set_count",
        help: "Reactions set count since exporter startup",
        labelNames: ["peerId", "emoji"],
    });

    const removed = new Counter({
        name: "messenger_dialog_reactions_removed_count",
        help: "Reactions removed count since exporter startup",
        labelNames: ["peerId", "emoji"],
    });

    const peersSize = new Gauge({
        name: "mtproto_exporter_reactions_collector_peers_cache_size",
        help: "Size of peers cache map size in reactions collector",
        collect: () => {
            peersSize.set(peers.size);
        },
    });
    const messagesSize = new Gauge({
        name: "mtproto_exporter_reactions_collector_messages_cache_size",
        help: "Size of messages cache map size in reactions collector",
        collect: () => {
            messagesSize.reset();
            for (const m of peers.values()) {
                messagesSize.inc(m.size);
            }
        },
    });
    const reactionsSize = new Gauge({
        name: "mtproto_exporter_reactions_collector_reactions_cache_size",
        help: "Size of reactions cache map size in reactions collector",
        collect: () => {
            reactionsSize.reset();
            for (const m of peers.values()) {
                for (const r of m.values()) {
                    reactionsSize.inc(r.size);
                }
            }
        },
    });

    registry.registerMetric(set);
    registry.registerMetric(removed);
    registry.registerMetric(peersSize);
    registry.registerMetric(messagesSize);
    registry.registerMetric(reactionsSize);

    if (config.reactionsCollector.loadHistory) {
        console.log("fetching dialogs history into reactions collector cache....");
        const historyIterOptions = {
            limit: config.reactionsCollector.loadHistorySize,
        };
        for await (const dialog of tg.iterDialogs()) {
            console.log("fetching dialog with peer id", dialog.peer.id);
            if (!peersConfigBoolFilter(config, dialog.peer.id)) {
                continue;
            }
            for await (const message of tg.iterHistory(dialog.peer.id, historyIterOptions)) {
                await handleReactionsUpdate(message.id, dialog.peer.id, message.reactions?.raw.results ?? []);
            }
            await setTimeout(5000);
        }
    }

    // we need to count only new messages
    // because we don't know true number of reactions before updates
    dp.onNewMessage((message) => {
        const messages: MessageReactionsMap = peers.get(message.chat.id) ?? new Map();
        const reactions: ReactionsMap = messages.get(message.id) ?? new Map();

        reactions.clear();

        messages.set(message.id, reactions);
        peers.set(message.chat.id, messages);

        return PropagationAction.Continue;
    });

    tg.onRawUpdate.add(async (info) => {
        if ("updates" in info) {
            const updates = info.updates as tl.TypeUpdate[];
            const reactionsUpdates = updates.filter(u => u._ === "updateMessageReactions");
            for (const update of reactionsUpdates) {
                await handleReactionsUpdate(update.msgId, getRawPeerId(update.peer), update.reactions.results);
            }
        } else if (info.update && info.update._ === "updateMessageReactions") {
            await handleReactionsUpdate(info.update.msgId, getRawPeerId(info.update.peer), info.update.reactions.results);
        }
    });

    dp.onEditMessage(peersConfigFilter(config), async (message) => {
        if (!message.reactions || !message.reactions.reactions) {
            return;
        }
        await handleReactionsUpdate(message.id, message.chat.id, message.reactions.raw.results);
        return PropagationAction.Continue;
    });

    async function handleReactionsUpdate(messageId: number, peerId: number, reactions: tl.RawReactionCount[]) {
        const peer: MessageReactionsMap = peers.get(peerId) ?? new Map();
        const oldReactions = peer.get(messageId);

        const newReactions = new Map<string, number>();
        for (const r of reactions) {
            const emoji = getRawReactionEmoji(r.reaction);
            newReactions.set(emoji.id, r.count);
        }

        if (!oldReactions) {
            peer.set(messageId, newReactions);
            peers.set(peerId, peer);
            return;
        }

        const allReactions = new Set<string>([
            ...newReactions.keys(),
            ...oldReactions.keys(),
        ]);

        for (const r of allReactions) {
            const countBefore = oldReactions.get(r) ?? 0;
            const countAfter = newReactions.get(r) ?? 0;
            const diff = countAfter - countBefore;

            if (diff > 0) {
                set.inc({
                    peerId,
                    emoji: getEmojiNameFromId(r),
                });
            } else if (diff < 0) {
                removed.inc({
                    peerId,
                    emoji: getEmojiNameFromId(r),
                });
            }

            oldReactions.set(r, countAfter);
        }

        peer.set(messageId, oldReactions);
        peers.set(peerId, peer);
    }
}
