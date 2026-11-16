// Production server smoke: standalone build, native binding, FSRS-6/FSRS-7
// JSON/SSE train, evaluate, invalid requests, callback proxy and CORS.
// Run with `pnpm run test:server`.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { generatorParameters } from 'ts-fsrs'

import { buildStandalone, removeApp, startServer } from './app.mjs'
import { INVALID_CSV, syntheticRevlogCsv } from './fixtures.mjs'

// Loaded lazily so the standalone addon check sees only the app's addon.
const native = () =>
  createRequire(import.meta.url)('@open-spaced-repetition/binding')
const csv = syntheticRevlogCsv({ cards: 400 })
let appDir
let server
// Local callback receiver; nothing is sent to remote hosts.
let receiver
const received = []

before(async () => {
  appDir = buildStandalone()
  server = await startServer(appDir)
  receiver = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received.push(JSON.parse(body))
      res.end('ok')
    })
  })
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve))
})
after(() => {
  receiver?.close()
  server?.stop()
  if (appDir) removeApp(appDir)
})

// Expected server results, computed in-process from the same conversion.
function convert(modelVersion, timezone) {
  return native().convertCsvToFsrsItemsWithCardIds(
    new TextEncoder().encode(csv),
    4,
    timezone,
    modelVersion
  )
}

async function expectedWeights(options, withCardIds = true) {
  const { items, cardIds } = convert(options.modelVersion, 'UTC')
  const w = await native().computeParameters(items, {
    ...options,
    ...(withCardIds && { cardIds }),
  })
  return w.map((t) => +t.toFixed(8))
}

function expectedMetrics(w, modelVersion, timezone = 'Asia/Shanghai') {
  const { items, cardIds } = convert(modelVersion, timezone)
  return new (native().FSRSBinding)(w).evaluate(items, cardIds)
}

function form(fields, csvText = csv) {
  const body = new FormData()
  if (csvText !== null) {
    body.set('file', new Blob([csvText], { type: 'text/csv' }), 'revlog.csv')
  }
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  return body
}

const post = (path, body) =>
  fetch(`${server.baseUrl}${path}`, { method: 'POST', body })

async function readSse(res) {
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/event-stream/)
  return (await res.text())
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const event = {}
      for (const line of chunk.split('\n')) {
        const i = line.indexOf(':')
        event[line.slice(0, i)] = line.slice(i + 1).trim()
      }
      return { event: event.event, data: JSON.parse(event.data) }
    })
}

function assertWeights(w, length = 21) {
  assert.equal(w.length, length)
  assert.ok(w.every(Number.isFinite), `non-finite weight in ${w}`)
}

function assertMetrics(metrics) {
  assert.ok(Number.isFinite(metrics.logLoss))
  assert.ok(Number.isFinite(metrics.rmseBins))
}

test('standalone output loads the native binding', () => {
  // Turbopack externalizes serverExternalPackages via hashed aliases here.
  const aliases = join(appDir, '.next/node_modules/@open-spaced-repetition')
  const alias = readdirSync(aliases).find((n) => n.startsWith('binding-'))
  assert.ok(alias, 'binding alias missing from standalone output')
  const require = createRequire(join(appDir, 'server.js'))
  const binding = require(join(aliases, alias))
  assert.equal(binding.__napiBindingTarget, 'native')
  const addon = Object.keys(require.cache).find((k) => k.endsWith('.node'))
  assert.ok(addon?.startsWith(appDir), `native addon loaded from ${addon}`)
})

const trained = {}
const fsrs6Keys = Object.keys(generatorParameters()).sort()

for (const enableShortTerm of ['1', '0']) {
  test(`FSRS-6 JSON train enable_short_term=${enableShortTerm}`, async () => {
    const res = await post(
      '/api/train',
      form({ sse: '0', enable_short_term: enableShortTerm, timezone: 'UTC' })
    )
    assert.equal(res.status, 200)
    const { params, metrics } = await res.json()
    // Legacy ts-fsrs FSRS-6 params shape is preserved.
    assert.deepEqual(Object.keys(params).sort(), fsrs6Keys)
    assertWeights(params.w)
    assert.equal(params.enable_short_term, enableShortTerm === '1')
    // Trained on the card-aware conversion: matches training with cardIds.
    const options = {
      modelVersion: 'FSRS-6',
      enableShortTerm: enableShortTerm === '1',
    }
    assert.deepEqual(params.w, await expectedWeights(options))
    assert.notDeepEqual(params.w, await expectedWeights(options, false))
    assertMetrics(metrics)
    trained['FSRS-6'] ??= params.w
  })
}

test('FSRS-6 ignores enable_sched_penalties', async () => {
  const train = async (fields) => {
    const res = await post(
      '/api/train',
      form({ sse: '0', model_version: 'FSRS-6', timezone: 'UTC', ...fields })
    )
    assert.equal(res.status, 200)
    return res.json()
  }
  const withPenalties = await train({ enable_sched_penalties: '1' })
  assert.deepEqual(withPenalties, await train({}))
  assert.equal(withPenalties.params.enable_sched_penalties, undefined)
})

test('SSE train with default flags', async () => {
  const events = await readSse(await post('/api/train', form({})))
  assert.equal(events[0].data.type, 'File analysis')
  assert.ok(events[0].data.fsrsItems > 0)
  const done = events.find((e) => e.event === 'done')
  assert.deepEqual(Object.keys(done.data.params).sort(), fsrs6Keys)
  assertWeights(done.data.params.w)
  assert.equal(done.data.params.enable_short_term, true)
  assertMetrics(done.data.metrics)
})

for (const enableSchedPenalties of ['1', '0']) {
  test(`FSRS-7 JSON and SSE train enable_sched_penalties=${enableSchedPenalties}`, async () => {
    const fields = {
      model_version: 'FSRS-7',
      enable_sched_penalties: enableSchedPenalties,
      timezone: 'UTC',
    }
    // enable_short_term=0 is normalized to true for FSRS-7.
    const res = await post(
      '/api/train',
      form({ ...fields, sse: '0', enable_short_term: '0' })
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(Object.keys(json.params).sort(), [
      'enable_sched_penalties',
      'model_version',
      'w',
    ])
    assert.equal(json.params.model_version, 'FSRS-7')
    assert.equal(
      json.params.enable_sched_penalties,
      enableSchedPenalties === '1'
    )
    assertWeights(json.params.w, 34)
    const options = {
      modelVersion: 'FSRS-7',
      enableShortTerm: true,
      enableSchedPenalties: enableSchedPenalties === '1',
    }
    assert.deepEqual(json.params.w, await expectedWeights(options))
    assert.notDeepEqual(json.params.w, await expectedWeights(options, false))
    assertMetrics(json.metrics)
    assert.deepEqual(
      json.metrics,
      expectedMetrics(json.params.w, 'FSRS-7', 'UTC')
    )

    const events = await readSse(await post('/api/train', form(fields)))
    assert.equal(events[0].data.type, 'File analysis')
    assert.deepEqual(events.find((e) => e.event === 'done').data, json)
    trained[`FSRS-7-${enableSchedPenalties}`] = json.params.w
  })
}

test('FSRS-7 scheduling penalties change the weights', () => {
  assert.notDeepEqual(trained['FSRS-7-1'], trained['FSRS-7-0'])
})

for (const [modelVersion, key] of [
  ['FSRS-6', 'FSRS-6'],
  ['FSRS-7', 'FSRS-7-0'],
]) {
  test(`${modelVersion} JSON and SSE evaluate`, async () => {
    const w = JSON.stringify(trained[key])
    const res = await post('/api/train/evaluate', form({ sse: '0', w }))
    assert.equal(res.status, 200)
    const metrics = await res.json()
    assertMetrics(metrics)
    // Converted with the model inferred from the weights, with card IDs.
    assert.deepEqual(metrics, expectedMetrics(trained[key], modelVersion))

    const events = await readSse(await post('/api/train/evaluate', form({ w })))
    assert.deepEqual(events.find((e) => e.event === 'done').data, metrics)
  })
}

test('FSRS-7 weights are evaluated on the FSRS-7 conversion', async () => {
  const w = trained['FSRS-7-0']
  const res = await post(
    '/api/train/evaluate',
    form({ sse: '0', w: JSON.stringify(w) })
  )
  assert.notDeepEqual(await res.json(), expectedMetrics(w, 'FSRS-6'))
})

test('evaluate accepts legacy 17/19-weight vectors (README example)', async () => {
  const w19 = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
    0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
    0.6621,
  ]
  for (const w of [w19, w19.slice(0, 17)]) {
    const res = await post(
      '/api/train/evaluate',
      form({ sse: '0', w: JSON.stringify(w) })
    )
    assert.equal(res.status, 200)
    // Legacy vectors are migrated to 21 FSRS-6 weights by ts-fsrs.
    assert.deepEqual(
      await res.json(),
      expectedMetrics([...generatorParameters({ w }).w], 'FSRS-6')
    )
  }
})

test('invalid requests are rejected', async () => {
  const w = (n, last = 0.5) =>
    `[${[...Array.from({ length: n - 1 }, () => 1), last]}]`
  const cases = [
    ['/api/train', form({ sse: '0' }, null), 400],
    ['/api/train', form({ sse: '0', model_version: 'FSRS-5' }), 400],
    ['/api/train/evaluate', form({ sse: '0' }), 400],
    ['/api/train/evaluate', form({ sse: '0', w: '[1,abc]' }), 400],
    ['/api/train', form({ sse: '0' }, INVALID_CSV), 500],
  ]
  // Weights are validated before the CSV is converted.
  for (const bad of [w(20), w(22), w(33), w(35), w(21, 'Infinity')]) {
    cases.push([
      '/api/train/evaluate',
      form({ sse: '0', w: bad }, INVALID_CSV),
      400,
    ])
  }
  for (const [path, body, status] of cases) {
    const res = await post(path, body)
    assert.equal(res.status, status, `${path} -> ${res.status}`)
  }
})

test('callback proxy forwards FSRS-6 and FSRS-7 bodies unchanged', async () => {
  const url = `http://127.0.0.1:${receiver.address().port}/hook`
  const meta = {
    tz: 'UTC',
    nextDayStartAt: 4,
    total_rows: 0,
    total_cards: 0,
    total_fsrs_items: 0,
  }
  const bodies = [
    {
      ...meta,
      short_term_params: trained['FSRS-6'],
      long_term_params: trained['FSRS-6'],
    },
    {
      model_version: 'FSRS-7',
      ...meta,
      penalties_enabled_params: trained['FSRS-7-1'],
      penalties_disabled_params: trained['FSRS-7-0'],
    },
  ]
  const proxy = (body) =>
    fetch(`${server.baseUrl}/api/support/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, body }),
    })
  received.length = 0
  for (const body of bodies) {
    const res = await proxy(body)
    assert.equal(res.status, 200)
  }
  assert.deepEqual(received, bodies)

  const invalid = {
    ...bodies[1],
    penalties_enabled_params: trained['FSRS-7-1'].slice(1),
  }
  assert.equal((await proxy(invalid)).status, 400)
  assert.equal(received.length, 2)
})

test('API CORS is preserved without cross-origin isolation headers', async () => {
  const preflight = await fetch(`${server.baseUrl}/api/train`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')

  const res = await fetch(`${server.baseUrl}/api/support/timezones`, {
    headers: { Origin: 'https://example.com' },
  })
  assert.equal(res.headers.get('access-control-allow-origin'), '*')

  const page = await fetch(`${server.baseUrl}/`)
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('cross-origin-opener-policy'), null)
  assert.equal(page.headers.get('cross-origin-embedder-policy'), null)
  assert.equal(page.headers.get('access-control-allow-origin'), '*')
})
