import type { OptionDefinition } from "command-line-args";
import type { RawKeywordLike } from "./keywords.js";
import { readFile } from "node:fs/promises";
import cmdline from "command-line-args";
import yaml from "js-yaml";

export interface Configuration {
    bindHost: string;
    port: number;
    wordsCounter: boolean;
    keywordsFile: string;
    watchFile: boolean;
    includePeers?: number[];
    excludePeers?: number[];
    keywords?: RawKeywordLike[];
}

const optionDefinitions: OptionDefinition[] = [
    { name: "bind-host", alias: "b", type: String, defaultValue: "0.0.0.0" },
    { name: "port", alias: "p", type: Number, defaultValue: 9669 },
    { name: "words-counter", type: Boolean, defaultValue: false },
    { name: "keywords-file", alias: "k", type: String },
    { name: "watch-file", alias: "w", type: Boolean, defaultValue: false },
    { name: "include-peers", alias: "i", type: String, multiple: true },
    { name: "exclude-peers", alias: "x", type: String, multiple: true },
];

const cli = cmdline(optionDefinitions);

const config: Configuration = {
    bindHost: cli["bind-host"],
    port: cli.port,
    wordsCounter: cli["words-counter"],
    keywordsFile: cli["keywords-file"],
    watchFile: cli["watch-file"],
    keywords: cli["keywords-file"] ? await readKeywords(cli["keywords-file"]) : undefined,
};

if (cli["include-peers"] && cli["exclude-peers"]) {
    throw new Error("Conflicting configuration: --include-peers and --exclude-peers can't be both specified at the same time.");
}

if (cli["include-peers"]) {
    config.includePeers = [];
    for (const o of cli["include-peers"] as string[]) {
        config.includePeers.push(...o.split(",").map(i => Number.parseInt(i)).filter(i => !Number.isNaN(i)));
    }
}

if (cli["exclude-peers"]) {
    config.excludePeers = [];
    for (const o of cli["exclude-peers"] as string[]) {
        config.excludePeers.push(...o.split(",").map(i => Number.parseInt(i)).filter(i => !Number.isNaN(i)));
    }
}

export async function readKeywords(filePath: string): Promise<RawKeywordLike[]> {
    const doc = yaml.load(await readFile(filePath, "utf8")) as { keywords?: any[] };

    if (doc.keywords && doc.keywords.constructor.name === "Array") {
        const keywords: RawKeywordLike[] = [];
        for (const item of doc.keywords) {
            if (typeof item === "string") {
                keywords.push(item);
            } else if (typeof item === "object" && typeof item.name === "string") {
                if (typeof item.pattern === "string") {
                    keywords.push({
                        name: item.name,
                        pattern: item.pattern,
                        word: Boolean(item.word ?? false),
                    });
                }
            }
        }
        return keywords;
    } else {
        throw new Error("Keywords file format error: no 'keywords' property, or not an array.");
    }
}

export { config };
