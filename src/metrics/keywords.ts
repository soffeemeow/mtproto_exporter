import type { Dispatcher } from "@mtcute/dispatcher";

import { PropagationAction } from "@mtcute/dispatcher";
import { Counter } from "prom-client";

import { config } from "../config.js";
import { peersConfigFilter } from "../filters.js";
import { escapeRegex } from "../utils.js";

export interface RawKeywordPattern {
    name: string;
    pattern: string;
    word: boolean;
    flags: {
        global: boolean;
        multi_line: boolean;
        insensitive: boolean;
    }
}

export type RawKeywordLike = string | RawKeywordPattern;

export interface KeywordPattern {
    name: string;
    pattern: RegExp;
}

export function rawToPatterns(raw: RawKeywordLike[]): KeywordPattern[] {
    const patterns: KeywordPattern[] = [];
    for (const keyword of raw) {
        let pattern;
        let name;
        let addBorders = false;
        let flags = "giu";

        if (typeof keyword === "string") {
            pattern = escapeRegex(keyword);
            name = keyword;
            addBorders = true;
        } else {
            pattern = keyword.pattern;
            name = keyword.name;
            addBorders = keyword.word;

            flags = "u";
            if (keyword.flags.global) {
                flags += "g";
            }

            if (keyword.flags.insensitive) {
                flags += "i";
            }

            if (keyword.flags.multi_line) {
                flags += "m";
            }
        }

        const wordBorder = escapeRegex("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");
        const borderStart = addBorders ? `(?<=[${wordBorder}\\s]|^)` : "";
        const borderEnd = addBorders ? `(?=[${wordBorder}\\s]|$)` : "";

        patterns.push({
            name,
            pattern: new RegExp(`${borderStart}(?:${pattern})${borderEnd}`, flags),
        });
    }

    return patterns;
}

export class KeywordsCounter extends Counter {
    private _dp: Dispatcher;
    private _keywords: KeywordPattern[];
    constructor(dp: Dispatcher, keywords: KeywordPattern[] = []) {
        super({
            name: "messenger_dialog_keywords_count",
            help: "Number of keywords found in messages since exporter startup",
            labelNames: ["peerId", "keyword"],
        });
        this._dp = dp;
        this._keywords = keywords;

        this._dp.onNewMessage(peersConfigFilter(config), async (msg) => {
            for (const kw of this._keywords) {
                const count = (msg.text.match(kw.pattern) ?? []).length;

                // this will prevent from flooding metrics with keywords that had never been triggered yet
                if (count === 0) {
                    continue;
                }

                this.inc({
                    peerId: msg.chat.id,
                    keyword: kw.name,
                }, count);
            }
            return PropagationAction.Continue;
        });
    }

    public get keywords() {
        return this._keywords;
    }

    public setKeywords(keywords: KeywordPattern[]) {
        this._keywords = keywords;
    }
}

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
