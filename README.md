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
}
```

## Service-Side

### Train

When using the `Train` interface, you need to provide the following parameters:

- **file**: The CSV file to be uploaded, containing the data needed for training.
- **timezone**: Optional parameter, defaults to `Asia/Shanghai`, used to set the timezone.
- **enable_short_term**: Optional parameter, determines whether to enable short-term memory. Defaults to `1` (enabled). If set to `0`, short-term memory will be disabled.
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

![train](images/image.png)

### Evaluate

When using the `Evaluate` interface, you need to provide the following parameters:

- **file**: The CSV file to be uploaded, containing the data needed for evaluation.
- **timezone**: Optional parameter, defaults to `Asia/Shanghai`, used to set the timezone.
- **w**: Required parameter, represents an array of weighted coefficients. This array contains the coefficients needed for model evaluation and should be passed as a comma-separated string of numbers.
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
