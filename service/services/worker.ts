import { base64ToArrayBuffer, fsrsBrowserWasmBase64 } from '@api/services/wasm'
import init, { Fsrs, InitOutput, initThreadPool, Progress } from 'fsrs-browser/fsrs_browser'
import { default_w } from 'ts-fsrs'

import { FSRSItem, ProgressFinish, ProgressStart } from './types'

Error.stackTraceLimit = 30

let container: InitOutput | null = null
let progress: Progress | null = null
self.onmessage = async (event) => {
  const { items, enableShortTerm, init } = event.data
  if (init) {
    await initFSRS()
    self.postMessage({
      tag: 'initd',
    })
  }
  if (items instanceof Array) {
    await computeParameters(items, enableShortTerm ?? true)
  }
}

async function initFSRS() {
  // https://github.com/open-spaced-repetition/fsrs-browser/blob/b44d5ab7d0b44a7cad8b0a61a68440fdfd7e9496/sandbox/src/train.ts#L11-L12
  // PR#10: https://github.com/open-spaced-repetition/fsrs-browser/pull/10#issuecomment-1973066639
  try {
    if (!container) {
      container = await init(base64ToArrayBuffer(fsrsBrowserWasmBase64))
      await initThreadPool(navigator.hardwareConcurrency)
    }
  } catch (e) {
    self.postMessage({ tag: 'error', error: `init failed error:${(e as Error).message}` })
  }
}

export async function computeParameters(items: FSRSItem[], enableShortTerm: boolean) {
  await initFSRS()

  const ratings = new Uint32Array(items.flatMap((item) => item.map((review) => review.rating)))
  const deltaTs = new Uint32Array(items.flatMap((item) => item.map((review) => review.deltaT)))
  const lengths = new Uint32Array(items.map((item) => item.length))
  const fsrs = new Fsrs(Float32Array.from(default_w))
  progress = Progress.new()
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
    enableShortTerm,
  } satisfies ProgressFinish)
  progress = null
  return parameters
}
