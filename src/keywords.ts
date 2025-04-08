import type { Dispatcher } from "@mtcute/dispatcher";
import { PropagationAction } from "@mtcute/dispatcher";
import { Counter } from "prom-client";
import { config } from "./config.js";
import { peersConfigFilter } from "./filters.js";

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

export class KeywordsCounter extends Counter {
    private _dp: Dispatcher;
    private _keywords: KeywordLike[];
    constructor(dp: Dispatcher, keywords: KeywordLike[] = []) {
        super({
            name: "messenger_dialog_keywords_count",
            help: "Number of keywords found in messages since exporter startup",
            labelNames: ["peerId", "keyword"],
        });
        this._dp = dp;
        this._keywords = keywords;

        dp.onNewMessage(peersConfigFilter(config), async (msg) => {
            for (const kw of this._keywords) {
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
                this.inc({
                    peerId: msg.chat.id,
                    keyword: kwname,
                }, count);
            }
            return PropagationAction.Continue;
        });
    }

    public get keywords() {
        return this._keywords;
    }

    public setKeywords(keywords: KeywordLike[]) {
        this._keywords = keywords;
    }
}
