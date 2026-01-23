import fs from "node:fs";
import { Dispatcher } from "@mtcute/dispatcher";
import { TelegramClient } from "@mtcute/node";

import { collectDefaultMetrics, Registry } from "prom-client";
import { config, readKeywords } from "./config.js";
import * as env from "./env.js";
import { rawToPatterns } from "./metrics/keywords.js";
import * as metrics from "./metrics/metrics.js";
import MetricsServer from "./server.js";

const registry = new Registry();

collectDefaultMetrics({ register: registry });

const server = new MetricsServer(registry);
server.listen(config.bindHost, config.port);

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

if (config.collectors.dialogs) {
    metrics.collectDialogMetrics(tg, registry);
}

if (config.collectors.messages) {
    metrics.collectNewMessageMetrics(dp, registry);
}

if (config.collectors.reactions) {
    console.log("[WARN] reactions-collector is enabled, but it is very experimental and almost does not work. i don't recommend enabling it especially for production use.")
    metrics.collectReactionsMetrics(tg, dp, registry);
}

if (config.keywords) {
    const counter = new metrics.KeywordsCounter(dp, rawToPatterns(config.keywords));
    registry.registerMetric(counter);

    if (config.watchFile) {
        fs.watchFile(config.keywordsFile, async (curr, prev) => {
            if (curr.mtimeMs === prev.mtimeMs) {
                return;
            }
            console.log("[watch-file] Keywords file was updated. Reloading keywords configuration...");
            try {
                config.keywords = await readKeywords(config.keywordsFile);
                counter.setKeywords(rawToPatterns(config.keywords));
            } catch (e) {
                console.error("Failed to read keywords file", config.keywordsFile, e);
            }
        });
    }
}

if (config.wordsCounter) {
    registry.registerMetric(metrics.newWordsCounter(dp));
}
