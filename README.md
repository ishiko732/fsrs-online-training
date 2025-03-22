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

```bash
curl --location 'https://ishiko732-fsrs-online-training.hf.space/api/train' \
--header 'Authorization: Token f7e84b54445cd116534d69586e20e820d306f091' \
--form 'file=@"/Users/ishiko/code/fsrs-rs-nodejs/revlog.csv"' \
--form 'sse="1"' \
--form 'hour_offset="4"' \
--form 'enable_short_term="0"' \
--form 'timezone="Asia/Shanghai"'
```

![alt text](images/image.png)