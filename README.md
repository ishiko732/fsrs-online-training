---
title: FSRS Online Training
emoji: 🧠
colorFrom: indigo
colorTo: pink
sdk: docker
pinned: false
app_port: 3000
---

# How to use ?

open https://optimizer.parallelveil.com

or

> https://optimizer.parallelveil.com/#csv=https://github.com/open-spaced-repetition/fsrs-rs/files/15046782/revlog.csv&tz=Asia/tokyo&nextDayStartAt=4&tz=Asia/tokyo&nextDayStartAt=4
>
> https://optimizer.parallelveil.com/#csv=https://github.com/open-spaced-repetition/fsrs-rs/files/15046782/revlog.csv&tz=Asia/tokyo&nextDayStartAt=4&tz=Asia/tokyo&nextDayStartAt=4&callback=http://localhost:3000&callbackOnClient=1

You can visit the website with parameters. For specific parameters, please refer to:

https://github.com/ishiko732/analyzer-and-train/blob/ed22c90c2ee799c65e20698135dbf3d1d1b03166/service/services/hash_parse.ts

```typescript
export interface HashParseRequest {
  csv?: string
  fetchOnClient?: '1' | '0'
  tz: string
  nextDayStartAt: number
  callback?: string
  callbackOnClient: '1' | '0'
  modelVersion?: 'FSRS-6' | 'FSRS-7' // defaults to FSRS-6
}
```

The browser trains two comparison results for the selected model:

- **FSRS-6** (21 weights): short-term enabled and disabled.
- **FSRS-7** (34 weights, always trained with short-term enabled): scheduling
  penalties enabled and disabled.

The callback receives a `POST` with a JSON body. FSRS-6 keeps the legacy body:

```jsonc
{
  "tz": "Asia/Tokyo",
  "nextDayStartAt": 4,
  "total_rows": 0,
  "total_cards": 0,
  "total_fsrs_items": 0,
  "short_term_params": [/* 21 weights */],
  "long_term_params": [/* 21 weights */]
}
```

FSRS-7 adds `model_version` and reports the penalty comparison instead:

```jsonc
{
  "model_version": "FSRS-7",
  "tz": "Asia/Tokyo",
  "nextDayStartAt": 4,
  "total_rows": 0,
  "total_cards": 0,
  "total_fsrs_items": 0,
  "penalties_enabled_params": [/* 34 weights */],
  "penalties_disabled_params": [/* 34 weights */]
}
```

`callbackOnClient=1` posts from the browser; otherwise the server proxies the
same body. The anki fsrs visualizer link is offered for FSRS-6 weights only.

## Service-Side

### Train

When using the `Train` interface, you need to provide the following parameters:

- **file**: The CSV file to be uploaded, containing the data needed for training.
- **timezone**: Optional parameter, defaults to `Asia/Shanghai`, used to set the timezone.
- **model_version**: Optional parameter, `FSRS-6` (default) or `FSRS-7`.
- **enable_short_term**: Optional parameter, determines whether to enable short-term memory. Defaults to `1` (enabled). If set to `0`, short-term memory will be disabled. FSRS-7 always trains with short-term enabled.
- **enable_sched_penalties**: Optional parameter, `1` enables FSRS-7 scheduling penalties during training. Defaults to `0`; ignored by FSRS-6.
- **hour_offset**: Optional parameter, used to set the time offset. Defaults to `4`. This value affects scheduling and data processing times.
- **sse**: Optional parameter, determines whether to enable server-sent events (SSE). Defaults to `1`, enabling SSE. If not needed, set to `0`.

Example:

```bash
curl --location 'https://ishiko732-fsrs-online-training.hf.space/api/train' \
--form 'file=@"/Users/ishiko/code/fsrs-rs-nodejs/revlog.csv"' \
--form 'sse="1"' \
--form 'hour_offset="4"' \
--form 'enable_short_term="0"' \
--form 'timezone="Asia/Shanghai"'
```

For FSRS-6, `params` is the ts-fsrs FSRS-6 parameter object (21 weights). For
FSRS-7, the JSON and SSE `done` payloads use the same `{ params, metrics }`
envelope with `params` set to
`{ "model_version": "FSRS-7", "w": [/* 34 weights */], "enable_sched_penalties": false }`.

![train](images/image.png)

### Evaluate

When using the `Evaluate` interface, you need to provide the following parameters:

- **file**: The CSV file to be uploaded, containing the data needed for evaluation.
- **timezone**: Optional parameter, defaults to `Asia/Shanghai`, used to set the timezone.
- **w**: Required parameter, represents an array of weighted coefficients. This array contains the coefficients needed for model evaluation and should be passed as a comma-separated string of numbers. 17, 19 or 21 finite numbers evaluate as FSRS-6 (17/19 are migrated to 21), 34 as FSRS-7; other lengths are rejected with `400`.
- **hour_offset**: Optional parameter, used to set the time offset. Defaults to `4`.
- **sse**: Optional parameter, determines whether to enable server-sent events (SSE). Defaults to `1`, enabling SSE. If not needed, set to `0`.

Example:

```bash
curl --location 'https://ishiko732-fsrs-online-training.hf.space/api/train/evaluate' \
--form 'file=@"/Users/liuyuanfeng/code-remote/fsrs-rs-nodejs/revlog.csv"' \
--form 'sse="1"' \
--form 'hour_offset="4"' \
--form 'timezone="Asia/Shanghai"' \
--form 'w="[0.40255,1.18385,3.173,15.69105,7.1949,0.5345,1.4604,0.0046,1.54575,0.1192,1.01925,1.9395,0.11,0.29605,2.2698,0.2315,2.9898,0.51655,0.6621]"'
```

![evaluate](images/evaluate.png)

## Development

Requires Node.js 24 or newer. The server trains with the native
`@open-spaced-repetition/binding`; the browser trains in a dedicated Worker with
the threadless `@open-spaced-repetition/binding-wasm32-wasip1`, so no
cross-origin isolation (COOP/COEP) headers are needed. Both convert CSV with
`convertCsvToFsrsItemsWithCardIds` for the selected model and pass the card IDs
to training and evaluation (card-aware windowed training, so weights differ
from releases that trained without card IDs). ts-fsrs 5.x only represents
FSRS-6, so FSRS-7 weights are returned without it.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test             # schema, native vs wasip1 conversion, FSRS-6/7 training
pnpm run test:server  # standalone build: native binding, FSRS-6/7 train, evaluate, callback
pnpm exec playwright install chromium  # once, for test:client
pnpm run test:client  # standalone build in Chromium: model switch, retry, callback
```

Tests use synthetic review logs only.
