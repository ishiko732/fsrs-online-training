// Deterministic regression checks: Zod 4 form semantics, native vs wasm32-wasip1
// CSV conversion (study-day rollover + DST, card IDs), and FSRS-6/FSRS-7
// training output.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'

import {
  DEFAULT_MAXIMUM_INTERVAL,
  defaultLearningSteps,
  defaultRelearningSteps,
} from 'ts-fsrs'
import {
  clipFSRS6Parameters,
  FSRS6_DEFAULT_WEIGHTS,
  migrateFSRS6Parameters,
} from 'ts-fsrs/models/fsrs-6'

import { Callback } from '../service/controllers/support.ts'
import {
  EvaluateFormData,
  modelVersionOfWeights,
  TrainFormData,
} from '../service/controllers/train.schema.ts'
import { HashObject } from '../service/services/hash_parse.ts'
import { INVALID_CSV, syntheticRevlogCsv, toCsv } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const native = require('@open-spaced-repetition/binding')
const wasip1 = require('@open-spaced-repetition/binding-wasm32-wasip1')
const runtimes = { native, wasip1 }
const MODEL_VERSION = 'FSRS-6'
const encode = (s) => new TextEncoder().encode(s)
const file = () => new File(['x'], 'revlog.csv')
const weights = (n) => `[${Array.from({ length: n }, (_, i) => i / 10 + 0.1)}]`
const W21 = weights(21)

describe('TrainFormData / EvaluateFormData (zod 4)', () => {
  test('defaults when optional fields are omitted', () => {
    const data = TrainFormData.parse({ file: file() })
    assert.equal(data.timezone, 'Asia/Shanghai')
    assert.equal(data.enable_short_term, true)
    assert.equal(data.sse, true)
    assert.equal(data.hour_offset, 4)
    assert.equal(data.model_version, 'FSRS-6')
    assert.equal(data.enable_sched_penalties, false)
    assert.equal(EvaluateFormData.parse({ file: file(), w: W21 }).sse, true)
  })

  test('model_version and normalized flags', () => {
    const parse = (fields) => TrainFormData.parse({ file: file(), ...fields })
    // FSRS-7 always trains with short-term enabled.
    const v7 = parse({
      model_version: 'FSRS-7',
      enable_short_term: '0',
      enable_sched_penalties: '1',
    })
    assert.equal(v7.model_version, 'FSRS-7')
    assert.equal(v7.enable_short_term, true)
    assert.equal(v7.enable_sched_penalties, true)
    assert.equal(
      parse({ model_version: 'FSRS-7' }).enable_sched_penalties,
      false
    )
    // FSRS-6 ignores penalties and keeps enable_short_term.
    const v6 = parse({
      model_version: 'FSRS-6',
      enable_short_term: '0',
      enable_sched_penalties: '1',
    })
    assert.equal(v6.enable_short_term, false)
    assert.equal(v6.enable_sched_penalties, false)
    for (const model_version of ['FSRS-5', 'fsrs-7', '7', '']) {
      assert.equal(
        TrainFormData.safeParse({ file: file(), model_version }).success,
        false,
        model_version
      )
    }
  })

  test('explicit 0/1 flags', () => {
    for (const [value, expected] of [
      ['0', false],
      ['1', true],
    ]) {
      const data = TrainFormData.parse({
        file: file(),
        enable_short_term: value,
        sse: value,
      })
      assert.equal(data.enable_short_term, expected)
      assert.equal(data.sse, expected)
      assert.equal(
        EvaluateFormData.parse({ file: file(), w: W21, sse: value }).sse,
        expected
      )
    }
  })

  test('hour_offset is clamped to [0, 23]', () => {
    const parse = (hour_offset) =>
      TrainFormData.parse({ file: file(), hour_offset }).hour_offset
    assert.equal(parse('7'), 7)
    assert.equal(parse('30'), 23)
    assert.equal(parse('-2'), 0)
  })

  test('rejects missing or invalid files', () => {
    assert.equal(TrainFormData.safeParse({}).success, false)
    assert.equal(TrainFormData.safeParse({ file: 'revlog.csv' }).success, false)
    assert.equal(EvaluateFormData.safeParse({ w: W21 }).success, false)
  })

  test('parses weights of supported lengths and infers the model', () => {
    const ok = EvaluateFormData.parse({
      file: file(),
      w: `[0.4, 1.2,${weights(19).slice(1)}`,
    })
    assert.deepEqual(ok.w.slice(0, 3), [0.4, 1.2, 0.1])
    assert.equal(ok.w.length, 21)
    for (const [n, model] of [
      [17, 'FSRS-6'],
      [19, 'FSRS-6'],
      [21, 'FSRS-6'],
      [34, 'FSRS-7'],
    ]) {
      const { w } = EvaluateFormData.parse({ file: file(), w: weights(n) })
      assert.equal(w.length, n)
      assert.equal(modelVersionOfWeights(w), model)
    }
  })

  test('rejects non-finite weights and unsupported lengths', () => {
    const w21 = W21.slice(1, -1).split(',')
    const invalid = [
      '[0.4,abc]',
      `[${[...w21.slice(1), 'Infinity']}]`,
      `[${[...w21.slice(1), '-Infinity']}]`,
      `[${[...w21.slice(1), 'NaN']}]`,
      '1',
      '',
      weights(20),
      weights(22),
      weights(33),
      weights(35),
      undefined,
      42,
    ]
    for (const w of invalid) {
      assert.equal(
        EvaluateFormData.safeParse({ file: file(), w }).success,
        false,
        `w=${w}`
      )
    }
  })
})

describe('HashObject (zod 4)', () => {
  test('defaults and clamping', () => {
    const data = HashObject.parse({ csv: 'a.csv', tz: 'UTC' })
    assert.equal(data.fetchOnClient, false)
    assert.equal(data.callbackOnClient, false)
    assert.equal(data.nextDayStartAt, 4)
    assert.equal(
      HashObject.parse({ csv: 'a.csv', tz: 'UTC', nextDayStartAt: 30 })
        .nextDayStartAt,
      23
    )
    assert.equal(
      HashObject.parse({ csv: '', tz: 'UTC', fetchOnClient: true })
        .fetchOnClient,
      true
    )
    assert.equal(HashObject.safeParse({ csv: 'a.csv' }).success, false)
  })

  test('modelVersion defaults to FSRS-6', () => {
    const parse = (modelVersion) =>
      HashObject.safeParse({ csv: 'a.csv', tz: 'UTC', modelVersion })
    assert.equal(parse(undefined).data.modelVersion, 'FSRS-6')
    assert.equal(parse('FSRS-6').data.modelVersion, 'FSRS-6')
    assert.equal(parse('FSRS-7').data.modelVersion, 'FSRS-7')
    assert.equal(parse('FSRS-5').success, false)
  })
})

describe('Callback schema', () => {
  const meta = {
    tz: 'UTC',
    nextDayStartAt: 4,
    total_rows: 0,
    total_cards: 0,
    total_fsrs_items: 0,
  }
  const numbers = (n) => Array.from({ length: n }, (_, i) => i / 10)
  const parse = (body) => Callback.safeParse({ url: 'http://x', body })

  test('legacy FSRS-6 body is accepted unchanged', () => {
    const body = {
      ...meta,
      short_term_params: numbers(21),
      long_term_params: numbers(21),
    }
    assert.deepEqual(parse(body).data.body, body)
  })

  test('FSRS-7 body keeps model_version and penalty results', () => {
    const body = {
      model_version: 'FSRS-7',
      ...meta,
      penalties_enabled_params: numbers(34),
      penalties_disabled_params: numbers(34),
    }
    assert.deepEqual(parse(body).data.body, body)
    for (const bad of [
      { ...body, penalties_enabled_params: numbers(21) },
      { ...body, model_version: 'FSRS-6' },
      { ...body, tz: undefined },
    ]) {
      assert.equal(parse(bad).success, false)
    }
  })
})

// America/New_York, next day starts at 04:00 local time.
// DST starts 2026-03-08 02:00 (-05:00 -> -04:00), ends 2026-11-01 02:00.
const boundaryCsv = toCsv(
  [
    // Spring forward: 03:30 EDT is before the rollover -> still study day 03-07.
    ['2026-03-07T10:00:00-05:00', 'spring', 3, 0],
    ['2026-03-08T03:30:00-04:00', 'spring', 3, 2],
    ['2026-03-08T04:30:00-04:00', 'spring', 3, 2],
    ['2026-03-10T12:00:00-04:00', 'spring', 1, 2],
    // Fall back: 03:59 EST is after the repeated hour but before rollover.
    ['2026-10-31T09:00:00-04:00', 'fall', 4, 0],
    ['2026-11-01T03:59:00-05:00', 'fall', 3, 2],
    ['2026-11-01T04:00:00-05:00', 'fall', 3, 2],
    ['2026-11-03T03:00:00-05:00', 'fall', 2, 2],
  ].map(([time, card, rating, state]) => [
    Date.parse(time),
    card,
    rating,
    1000,
    state,
  ])
)

const describeItems = (items) =>
  items.map((item) =>
    item.reviews.map((r) => `${r.rating}:${r.deltaT}`).join(' ')
  )

describe('CSV conversion: native vs wasm32-wasip1', () => {
  test('study-day rollover and DST produce expected whole-day intervals', () => {
    const expected = [
      // spring: 03-07 -> 03-07 (0d) -> 03-08 (1d) -> 03-10 (2d)
      '3:0 3:0 3:1',
      '3:0 3:0 3:1 1:2',
      // fall: 10-31 -> 10-31 (0d) -> 11-01 (1d) -> 11-02 (1d, before 04:00)
      '4:0 3:0 3:1',
      '4:0 3:0 3:1 2:1',
    ]
    for (const [name, binding] of Object.entries(runtimes)) {
      const items = binding.convertCsvToFsrsItems(
        encode(boundaryCsv),
        4,
        'America/New_York',
        MODEL_VERSION
      )
      assert.deepEqual(describeItems(items).sort(), expected.sort(), name)
    }
  })

  test('synthetic revlog converts identically', () => {
    const csv = encode(syntheticRevlogCsv())
    const [a, b] = [native, wasip1].map((binding) =>
      describeItems(
        binding.convertCsvToFsrsItems(csv, 4, 'Asia/Shanghai', MODEL_VERSION)
      )
    )
    assert.ok(a.length > 0)
    assert.deepEqual(a, b)
  })

  test('invalid CSV is rejected by both runtimes', () => {
    for (const [name, binding] of Object.entries(runtimes)) {
      assert.throws(
        () =>
          binding.convertCsvToFsrsItems(
            encode(INVALID_CSV),
            4,
            'UTC',
            MODEL_VERSION
          ),
        /CSV deserialization error/,
        name
      )
    }
  })
})

describe('CSV conversion with card IDs', () => {
  const csv = encode(syntheticRevlogCsv())

  for (const modelVersion of ['FSRS-6', 'FSRS-7']) {
    test(`${modelVersion}: items and cardIds stay aligned in both runtimes`, () => {
      const [a, b] = [native, wasip1].map((binding) =>
        binding.convertCsvToFsrsItemsWithCardIds(
          csv,
          4,
          'Asia/Shanghai',
          modelVersion
        )
      )
      for (const { items, cardIds } of [a, b]) {
        assert.ok(items.length > 0)
        assert.equal(cardIds.length, items.length)
        assert.ok(cardIds.every(Number.isInteger))
      }
      assert.deepEqual(a.cardIds, b.cardIds)
      assert.deepEqual(describeItems(a.items), describeItems(b.items))
      // Same items as the legacy converter of the same model.
      assert.deepEqual(
        describeItems(a.items),
        describeItems(
          native.convertCsvToFsrsItems(csv, 4, 'Asia/Shanghai', modelVersion)
        )
      )
    })
  }

  test('FSRS-7 conversion keeps fractional same-day intervals', () => {
    const convert = (modelVersion) =>
      native.convertCsvToFsrsItemsWithCardIds(
        encode(boundaryCsv),
        4,
        'America/New_York',
        modelVersion
      ).items
    const deltas = (items) =>
      items.flatMap((i) => i.reviews.map((r) => r.deltaT))
    assert.ok(deltas(convert('FSRS-6')).every(Number.isInteger))
    assert.ok(!deltas(convert('FSRS-7')).every(Number.isInteger))
  })
})

const fixture = encode(syntheticRevlogCsv({ cards: 400 }))
const train = (binding, options) => {
  const { items, cardIds } = binding.convertCsvToFsrsItemsWithCardIds(
    fixture,
    4,
    'UTC',
    options.modelVersion
  )
  return binding.computeParameters(items, { ...options, cardIds })
}

function assertModel(binding, w, length, modelVersion) {
  assert.equal(w.length, length)
  assert.ok(w.every(Number.isFinite), `non-finite weight in ${w}`)
  const { items, cardIds } = binding.convertCsvToFsrsItemsWithCardIds(
    fixture,
    4,
    'UTC',
    modelVersion
  )
  const metrics = new binding.FSRSBinding(w).evaluate(items, cardIds)
  assert.ok(Number.isFinite(metrics.logLoss))
  assert.ok(Number.isFinite(metrics.rmseBins))
}

describe('FSRS-6 training', () => {
  for (const [name, binding] of Object.entries(runtimes)) {
    for (const enableShortTerm of [true, false]) {
      test(`${name} enableShortTerm=${enableShortTerm} -> 21 finite weights`, async () => {
        const w = await train(binding, {
          enableShortTerm,
          modelVersion: MODEL_VERSION,
        })
        assertModel(binding, w, 21, MODEL_VERSION)
      })
    }
  }

  test('scheduling penalties are ignored', async () => {
    const options = { enableShortTerm: true, modelVersion: MODEL_VERSION }
    assert.deepEqual(
      await train(native, { ...options, enableSchedPenalties: true }),
      await train(native, options)
    )
  })
})

describe('FSRS-7 training', () => {
  for (const [name, binding] of Object.entries(runtimes)) {
    for (const enableSchedPenalties of [true, false]) {
      test(`${name} enableSchedPenalties=${enableSchedPenalties} -> 34 finite weights`, async () => {
        const w = await train(binding, {
          enableShortTerm: true,
          enableSchedPenalties,
          modelVersion: 'FSRS-7',
        })
        assertModel(binding, w, 34, 'FSRS-7')
      })
    }
  }

  test('scheduling penalties change the weights', async () => {
    const options = { enableShortTerm: true, modelVersion: 'FSRS-7' }
    assert.notDeepEqual(
      await train(native, { ...options, enableSchedPenalties: true }),
      await train(native, { ...options, enableSchedPenalties: false })
    )
  })
})

describe('card IDs', () => {
  test('mismatched cardIds are rejected by training and evaluation', async () => {
    const { items, cardIds } = native.convertCsvToFsrsItemsWithCardIds(
      fixture,
      4,
      'UTC',
      MODEL_VERSION
    )
    const short = cardIds.slice(1)
    await assert.rejects(
      native.computeParameters(items, {
        enableShortTerm: true,
        modelVersion: MODEL_VERSION,
        cardIds: short,
      }),
      /cardIds length must match items length/
    )
    const w = await native.computeParameters(items, {
      enableShortTerm: true,
      modelVersion: MODEL_VERSION,
      cardIds,
    })
    assert.throws(
      () => new native.FSRSBinding(w).evaluate(items, short),
      /cardIds length must match items length/
    )
  })
})

describe('FSRS-6 parameter normalization (v5 baseline)', () => {
  test('nondeprecated defaults match legacy v5 defaults', () => {
    assert.equal(DEFAULT_MAXIMUM_INTERVAL, 36500)
    assert.deepEqual([...defaultLearningSteps], ['1m', '10m'])
    assert.deepEqual([...defaultRelearningSteps], ['10m'])
    assert.equal(FSRS6_DEFAULT_WEIGHTS.length, 21)
  })

  test('normal 17/19/21 vectors normalize to pinned v5 baseline', () => {
    const w19 = [
      0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
      1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
      0.51655, 0.6621,
    ]
    const w17 = w19.slice(0, 17)
    const w21 = [...FSRS6_DEFAULT_WEIGHTS]

    assert.deepEqual(
      migrateFSRS6Parameters(clipFSRS6Parameters(w19, 1, true)),
      [
        0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
        1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
        0.51655, 0.6621, 0, 0.5,
      ]
    )
    assert.deepEqual(
      migrateFSRS6Parameters(clipFSRS6Parameters(w17, 1, true)),
      [
        0.40255, 1.18385, 3.173, 15.69105, 8.2639, 0.31895223, 1.9604, 0.0046,
        1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
        0, 0, 0, 0.5,
      ]
    )
    assert.deepEqual(
      migrateFSRS6Parameters(clipFSRS6Parameters(w21, 1, true)),
      w21
    )
  })

  test('OOB 17 input clips before migration and is not re-clipped after', () => {
    const oob17 = [
      0.1, 1.1, 2.1, 3.1, 20, -1, 10, 0.75, 4.5, 0.8, 3.5, 5, 0.25, 0.9, 4, 1,
      6,
    ]
    const expected = [
      0.1, 1.1, 2.1, 3.1, 10.002, 0.0009985, 4.5, 0.75, 4.5, 0.8, 3.5, 5, 0.25,
      0.9, 4, 1, 6, 0, 0, 0, 0.5,
    ]
    const actual = migrateFSRS6Parameters(clipFSRS6Parameters(oob17, 1, true))
    assert.deepEqual(actual, expected)
    // Input is not mutated and post-migration re-clipping would alter w4/w5/w6/w19.
    assert.equal(oob17[4], 20)
    assert.notDeepEqual(clipFSRS6Parameters(actual, 1, true), expected)
  })

  test('OOB 19 and 21 inputs clip before migration and honor short-term flag on w19', () => {
    const oob19 = [
      0, 150, 2.1, 3.1, 20, -1, 10, 0.9, 5, 1, 4, 6, 0.5, 1, 5, 2, 7, 3, -1,
    ]
    assert.deepEqual(
      migrateFSRS6Parameters(clipFSRS6Parameters(oob19, 1, true)),
      [
        0.001, 100, 2.1, 3.1, 10, 0.001, 4, 0.75, 4.5, 0.8, 3.5, 5, 0.25, 0.9,
        4, 1, 6, 2, 0, 0, 0.5,
      ]
    )

    const oob21 = [
      0, 150, 2.1, 3.1, 20, -1, 10, 0.9, 5, 1, 4, 6, 0.5, 1, 5, 2, 7, 3, -1, 0,
      0.05,
    ]
    assert.deepEqual(
      migrateFSRS6Parameters(clipFSRS6Parameters(oob21, 1, true)),
      [
        0.001, 100, 2.1, 3.1, 10, 0.001, 4, 0.75, 4.5, 0.8, 3.5, 5, 0.25, 0.9,
        4, 1, 6, 2, 0, 0.01, 0.1,
      ]
    )
    assert.deepEqual(
      migrateFSRS6Parameters(clipFSRS6Parameters(oob21, 1, false)),
      [
        0.001, 100, 2.1, 3.1, 10, 0.001, 4, 0.75, 4.5, 0.8, 3.5, 5, 0.25, 0.9,
        4, 1, 6, 2, 0, 0, 0.1,
      ]
    )

    const normal21WithZeroW19 = [...FSRS6_DEFAULT_WEIGHTS]
    normal21WithZeroW19[19] = 0
    assert.equal(
      migrateFSRS6Parameters(
        clipFSRS6Parameters(normal21WithZeroW19, 1, true)
      )[19],
      0.01
    )
    assert.equal(
      migrateFSRS6Parameters(
        clipFSRS6Parameters(normal21WithZeroW19, 1, false)
      )[19],
      0
    )
  })
})
