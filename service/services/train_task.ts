'use server'
// tip: It cannot run on Vercel because it got optimized away.
import { FSRS, FSRSItem, FSRSReview } from 'fsrs-rs-nodejs'

import { FSRSItem as BasicFSRSItem, ProgressValue } from './types'

type ProgressFunction = (enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) => void

function basicProgress(enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) {
  if (err) {
    console.error(`[enableShortTerm=${enableShortTerm}] Progress callback error:`, err)
    return
  }
  console.log(`[enableShortTerm=${enableShortTerm}] progress value`, progressValue)
}

async function computeParametersWrapper(enableShortTerm: boolean, fsrsItems: FSRSItem[], progress: ProgressFunction) {
  // create FSRS instance and optimize
  const fsrs = new FSRS(null)

  const optimizedParameters = await fsrs.computeParameters(fsrsItems, enableShortTerm, progress.bind(null, enableShortTerm), 1000 /** 1s */)
  return optimizedParameters
}

export async function trainTask(enableShortTerm: boolean, fsrsItems: BasicFSRSItem[], progress: ProgressFunction = basicProgress) {
  const fsrs_items = fsrsItems.map(
    (item: BasicFSRSItem) => new FSRSItem(item.map((review) => new FSRSReview(review.rating, review.deltaT))),
  )
  return computeParametersWrapper(enableShortTerm, fsrs_items, progress)
}
