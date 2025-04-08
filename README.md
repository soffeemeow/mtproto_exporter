# mtproto_exporter

mtcute powered Prometheus metrics exporter

*this exporter is mostly useful only with userbot*

## Available Metrics
`messenger_dialog_info{peerId, peerType, displayName}`

Dialog information exposed as labels

`messenger_dialog_messages_count{peerId}`

Messages count since exporter startup

`messenger_dialog_unread_messages_count{peerId}`

Number of unread messages in dialogs

`messenger_dialog_keywords_count{peerId}`

Number of keywords found in messages since exporter startup

`messenger_dialog_words_count{peerId}`

Number of words in messages since exporter startup

This metric is disabled by default because it will produce a lot of unique time series (more info [here](https://prometheus.io/docs/practices/naming/#labels))

This will expose each **word** in each **message** in each **chat** as unique metric.

This metric can be enabled with command line flag `--words-counter`

## CLI Options
`--bind-host`, `-b` - ip address where http server will be listening on

`--port`, `-p` - port where http server will be listening on

`--words-counter` - enable each word counting metric

`--keywords-file`, `-k` - path to yaml file with keywords and patterns (see [keywords.yml.example](./keywords.yml.example))

`--watch-file`, `-w` - watch for keywords file updates and reload keywords configuration in runtime

`--include-peers`, `-i` - comma-separated list of `peer.id`s to gather metrics from. 
if set, only specified peers will be exposed in metrics. 
can be specified multiple times. can not be used along with `--exclude-peers`

`--exclude-peers` `x` - comma-separated list of `peer.id`s to exclude from metrics. 
if set, specified peers will not be exposed in metrics. 
can be specified multiple times. can not be used along with `--include-peers`

## Environment Variables

`API_ID` - Telegram api id used for mtproto connection (see [mtcute.dev](https://mtcute.dev/guide/intro/sign-in.html))

`API_HASH` - Telegram api hash used for mtproto connection (see [mtcute.dev](https://mtcute.dev/guide/intro/sign-in.html))

## Development

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# edit .env
pnpm start
```

*generated with @mtcute/create-bot*
