import type { Dispatcher } from "@mtcute/dispatcher";

import { PropagationAction } from "@mtcute/dispatcher";
import { Counter } from "prom-client";

import { config } from "../config.js";
import { peersConfigFilter } from "../filters.js";

import { collectDialogMetrics } from "./dialogs.js";
import { KeywordsCounter } from "./keywords.js";
import { collectNewMessageMetrics } from "./message.js";
import { collectReactionsMetrics } from "./reactions.js";

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
    collectReactionsMetrics,
    KeywordsCounter,
    newWordsCounter,
};
