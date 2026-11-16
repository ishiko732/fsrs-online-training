// Deterministic regression checks: Zod 4 form semantics, native vs wasm32-wasip1
// CSV conversion (study-day rollover + DST), and FSRS-6 training output.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'

import {
  EvaluateFormData,
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

describe('TrainFormData / EvaluateFormData (zod 4)', () => {
  test('defaults when optional fields are omitted', () => {
    const data = TrainFormData.parse({ file: file() })
    assert.equal(data.timezone, 'Asia/Shanghai')
    assert.equal(data.enable_short_term, true)
    assert.equal(data.sse, true)
    assert.equal(data.hour_offset, 4)
    assert.equal(EvaluateFormData.parse({ file: file(), w: '1' }).sse, true)
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
        EvaluateFormData.parse({ file: file(), w: '1', sse: value }).sse,
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
    assert.equal(EvaluateFormData.safeParse({ w: '1' }).success, false)
  })

  test('parses weights and rejects invalid weights', () => {
    const ok = EvaluateFormData.parse({ file: file(), w: '[0.4, 1.2,3]' })
    assert.deepEqual(ok.w, [0.4, 1.2, 3])
    for (const w of ['[0.4,abc]', undefined, 42]) {
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

describe('FSRS-6 training', () => {
  const csv = encode(syntheticRevlogCsv({ cards: 400 }))

  for (const [name, binding] of Object.entries(runtimes)) {
    for (const enableShortTerm of [true, false]) {
      test(`${name} enableShortTerm=${enableShortTerm} -> 21 finite weights`, async () => {
        const items = binding.convertCsvToFsrsItems(
          csv,
          4,
          'UTC',
          MODEL_VERSION
        )
        const w = await binding.computeParameters(items, {
          enableShortTerm,
          modelVersion: MODEL_VERSION,
        })
        assert.equal(w.length, 21)
        assert.ok(w.every(Number.isFinite), `non-finite weight in ${w}`)
        const metrics = new binding.FSRSBinding(w).evaluate(items)
        assert.ok(Number.isFinite(metrics.logLoss))
        assert.ok(Number.isFinite(metrics.rmseBins))
      })
    }
  }
})
