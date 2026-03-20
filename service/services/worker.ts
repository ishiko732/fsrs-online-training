import { computeParameters, FSRSBindingItem, FSRSBindingReview } from '@open-spaced-repetition/binding'

import { FSRSItem, ProgressFinish, ProgressStart } from './types'

Error.stackTraceLimit = 30

self.onmessage = async (event) => {
  const { items, enableShortTerm, init } = event.data
  if (init) {
    self.postMessage({
      tag: 'initd',
    })
  }
  if (items instanceof Array) {
    await computeParametersWrapper(items, enableShortTerm ?? true)
  }
}

export async function computeParametersWrapper(items: FSRSItem[], enableShortTerm: boolean) {
  try {
    const bindingItems = items.map(
      (item) => new FSRSBindingItem(item.map((review) => new FSRSBindingReview(review.rating, review.deltaT))),
    )

    self.postMessage({
      tag: 'start',
    } satisfies ProgressStart)

    const parameters = await computeParameters(bindingItems, {
      enableShortTerm,
      progress: (current: number, total: number) => {
        self.postMessage({
          tag: 'progress',
          itemsProcessed: current,
          itemsTotal: total,
        })
      },
      timeout: 1000,
    })

    self.postMessage({
      tag: 'finish',
      parameters: Float32Array.from(parameters),
      enableShortTerm,
    } satisfies ProgressFinish)
    return parameters
  } catch (e) {
    self.postMessage({ tag: 'error', error: `computeParameters failed: ${(e as Error).message}` })
  }
}
