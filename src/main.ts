import type { OptionDefinition } from "command-line-args";
import type { KeywordLike } from "./keywords.js";
import fs from "node:fs";
import { Dispatcher } from "@mtcute/dispatcher";
import { TelegramClient } from "@mtcute/node";
import cmdline from "command-line-args";
import yaml from "js-yaml";
import { collectDefaultMetrics, Registry } from "prom-client";

import * as env from "./env.js";
import * as metrics from "./metrics.js";
import MetricsServer from "./server.js";

const optionDefinitions: OptionDefinition[] = [
    { name: "bind-host", alias: "b", type: String, defaultValue: "0.0.0.0" },
    { name: "port", alias: "p", type: Number, defaultValue: 9669 },
    { name: "words-counter", type: Boolean, defaultValue: false },
    { name: "keywords-file", alias: "k", type: String },
];

const cli = cmdline(optionDefinitions);

const keywords: KeywordLike[] = [];
if (cli["keywords-file"]) {
    if (!fs.existsSync(cli["keywords-file"])) {
        throw new Error("--keywords-file set, but file does not exist.");
    }
    const doc = yaml.load(fs.readFileSync(cli["keywords-file"], "utf8")) as { keywords?: any[] };

    if (doc.keywords && doc.keywords.constructor.name === "Array") {
        for (const item of doc.keywords) {
            if (typeof item === "string") {
                keywords.push(item);
            } else if (typeof item === "object" && item.name && item.pattern) {
                keywords.push({
                    name: item.name,
                    pattern: new RegExp(item.pattern, "gi"),
                });
            }
        }
    } else {
        throw new Error("Keywords file format error: no 'keywords' property, or not an array.");
    }
}

const registry = new Registry();

collectDefaultMetrics({ register: registry });

const server = new MetricsServer(registry);
server.listen(cli["bind-host"], cli.port);

const tg = new TelegramClient({
    apiId: env.API_ID,
    apiHash: env.API_HASH,
    storage: "bot-data/session",
});

const dp = Dispatcher.for(tg);

const user = await tg.start({
    phone: () => env.USERBOT_PHONE ?? tg.input("Phone > "),
    code: () => env.USERBOT_2FACODE ?? tg.input("Code > "),
    password: () => env.USERBOT_PASSWORD ?? tg.input("Password > "),
});

console.log("Logged in as", user.username);

registry.registerMetric(metrics.newStaticPeerInfoGauge(tg));
registry.registerMetric(metrics.newUnreadCountGauge(tg));
registry.registerMetric(metrics.newMessagesCounter(dp));

if (keywords.length > 0) {
    registry.registerMetric(metrics.newKeywordsCounter(dp, keywords));
}

if (cli["words-counter"]) {
    registry.registerMetric(metrics.newWordsCounter(dp));
}
