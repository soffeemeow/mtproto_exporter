import type { Dispatcher } from "@mtcute/dispatcher";
import { PropagationAction } from "@mtcute/dispatcher";
import { Counter } from "prom-client";

interface KeywordPattern {
    name: string;
    pattern: RegExp;
}

export type KeywordLike = string | KeywordPattern;

export function newWordsCounter(dp: Dispatcher) {
    const counter = new Counter({
        name: "messenger_dialog_words_count",
        help: "Number of words in messages since exporter startup",
        labelNames: ["peerId", "word"],
    });
    dp.onNewMessage(async (msg) => {
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

export function newKeywordsCounter(dp: Dispatcher, keywords: KeywordLike[]) {
    const counter = new Counter({
        name: "messenger_dialog_keywords_count",
        help: "Number of keywords found in messages since exporter startup",
        labelNames: ["peerId", "keyword"],
    });
    dp.onNewMessage(async (msg) => {
        for (const kw of keywords) {
            let count;
            let kwname;
            if (typeof kw === "string") {
                const words = msg.text.toLowerCase().split(" ");
                count = words.filter(w => w === kw).length;
                kwname = kw;
            } else {
                count = (msg.text.match(kw.pattern) || []).length;
                kwname = kw.name;
            }
            if (count === 0) {
                continue;
            }
            counter.inc({
                peerId: msg.chat.id,
                keyword: kwname,
            }, count);
        }
        return PropagationAction.Continue;
    });

    return counter;
}
