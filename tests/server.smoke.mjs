// Production server smoke: standalone build, native binding, JSON/SSE train,
// evaluate, invalid requests and CORS. Run with `pnpm run test:server`.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { buildStandalone, removeApp, startServer } from './app.mjs'
import { INVALID_CSV, syntheticRevlogCsv } from './fixtures.mjs'

const csv = syntheticRevlogCsv({ cards: 400 })
let appDir
let server

before(async () => {
  appDir = buildStandalone()
  server = await startServer(appDir)
})
after(() => {
  server?.stop()
  if (appDir) removeApp(appDir)
})

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

function assertWeights(w) {
  assert.equal(w.length, 21)
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

let trained
for (const enableShortTerm of ['1', '0']) {
  test(`JSON train enable_short_term=${enableShortTerm}`, async () => {
    const res = await post(
      '/api/train',
      form({ sse: '0', enable_short_term: enableShortTerm, timezone: 'UTC' })
    )
    assert.equal(res.status, 200)
    const { params, metrics } = await res.json()
    assertWeights(params.w)
    assert.equal(params.enable_short_term, enableShortTerm === '1')
    assertMetrics(metrics)
    trained ??= params.w
  })
}

test('SSE train with default flags', async () => {
  const events = await readSse(await post('/api/train', form({})))
  assert.equal(events[0].data.type, 'File analysis')
  assert.ok(events[0].data.fsrsItems > 0)
  const done = events.find((e) => e.event === 'done')
  assertWeights(done.data.params.w)
  assert.equal(done.data.params.enable_short_term, true)
  assertMetrics(done.data.metrics)
})

test('JSON and SSE evaluate', async () => {
  const w = JSON.stringify(trained)
  const res = await post('/api/train/evaluate', form({ sse: '0', w }))
  assert.equal(res.status, 200)
  assertMetrics(await res.json())

  const events = await readSse(await post('/api/train/evaluate', form({ w })))
  assertMetrics(events.find((e) => e.event === 'done').data)
})

test('evaluate accepts legacy 19-weight vectors (README example)', async () => {
  const w =
    '[0.40255,1.18385,3.173,15.69105,7.1949,0.5345,1.4604,0.0046,1.54575,0.1192,1.01925,1.9395,0.11,0.29605,2.2698,0.2315,2.9898,0.51655,0.6621]'
  const res = await post('/api/train/evaluate', form({ sse: '0', w }))
  assert.equal(res.status, 200)
  assertMetrics(await res.json())
})

test('invalid requests are rejected', async () => {
  const cases = [
    ['/api/train', form({ sse: '0' }, null), 400],
    ['/api/train/evaluate', form({ sse: '0' }), 400],
    ['/api/train/evaluate', form({ sse: '0', w: '[1,abc]' }), 400],
    ['/api/train', form({ sse: '0' }, INVALID_CSV), 500],
  ]
  for (const [path, body, status] of cases) {
    const res = await post(path, body)
    assert.equal(res.status, status, `${path} -> ${res.status}`)
  }
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
