# How to use ?

open https://optimizer.parallelveil.com

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
