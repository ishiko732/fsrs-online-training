import { base64ToArrayBuffer, fsrsBrowserWasmBase64 } from '@api/services/wasm'
import init, { Fsrs, InitOutput, initThreadPool, Progress } from 'fsrs-browser/fsrs_browser'

import { FSRSItem, ProgressFinish, ProgressStart } from './types'

Error.stackTraceLimit = 30

let container: InitOutput | null = null
let progress: Progress | null = null
self.onmessage = async (event) => {
  const { items, enableShortTerm } = event.data

  if (items instanceof Array) {
    const result = await computeParameters(items, enableShortTerm)
    self.postMessage(result)
  }
}

export async function computeParameters(items: FSRSItem[], enableShortTerm: boolean) {
  // https://github.com/open-spaced-repetition/fsrs-browser/blob/b44d5ab7d0b44a7cad8b0a61a68440fdfd7e9496/sandbox/src/train.ts#L11-L12
  // PR#10: https://github.com/open-spaced-repetition/fsrs-browser/pull/10#issuecomment-1973066639
  if (!container) {
    container = await init(base64ToArrayBuffer(fsrsBrowserWasmBase64))
    await initThreadPool(navigator.hardwareConcurrency)
  }

  progress = Progress.new()
  const ratings = new Uint32Array(items.flatMap((item) => item.map((review) => review.rating)))
  const deltaTs = new Uint32Array(items.flatMap((item) => item.map((review) => review.deltaT)))
  const lengths = new Uint32Array(items.map((item) => item.length))

  const fsrs = new Fsrs()
  console.time('full training time')
  // must set next.config.js
  // https://vercel.com/docs/projects/project-configuration#headers
  // https://vercel.com/guides/fix-shared-array-buffer-not-defined-nextjs-react
  self.postMessage({
    tag: 'start',
    wasmMemoryBuffer: container!.memory.buffer,
    pointer: progress.pointer(),
  } satisfies ProgressStart)
  const parameters = fsrs.computeParameters(ratings, deltaTs, lengths, progress, enableShortTerm)
  self.postMessage({
    tag: 'finish',
    parameters,
  } satisfies ProgressFinish)
  fsrs.free()
  progress = null
  // container = null;
  console.timeEnd('full training time')
  console.log(parameters)
  return parameters
}
