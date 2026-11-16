// Real-browser smoke of the shipped app: the page's own dedicated Worker loads
// wasm32-wasip1 without cross-origin isolation, trains the two comparison
// results of FSRS-6 (short-term on/off) and FSRS-7 (scheduling penalties
// on/off) across model switches, reports an invalid CSV, recovers on retry,
// and posts identical direct/proxied callbacks to a local receiver.
// Run with `pnpm run test:client` (once: `pnpm exec playwright install chromium`).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

import { chromium } from 'playwright'

import { buildStandalone, removeApp, startServer } from './app.mjs'
import { INVALID_CSV, syntheticRevlogCsv } from './fixtures.mjs'

const csvText = syntheticRevlogCsv({ cards: 400 })
const fixtureDir = mkdtempSync(join(tmpdir(), 'fsrs-csv-'))
const validCsv = join(fixtureDir, 'revlog.csv')
const invalidCsv = join(fixtureDir, 'invalid.csv')
writeFileSync(validCsv, csvText)
writeFileSync(invalidCsv, INVALID_CSV)

// The comparison runs of each model, in training order.
const RUNS = {
  'FSRS-6': [{ enableShortTerm: true }, { enableShortTerm: false }],
  'FSRS-7': [{ enableSchedPenalties: true }, { enableSchedPenalties: false }],
}
const LABELS = {
  'FSRS-6': ['Short-Term', 'Long-Term'],
  'FSRS-7': ['Scheduling Penalties On', 'Scheduling Penalties Off'],
}
const WEIGHTS = { 'FSRS-6': 21, 'FSRS-7': 34 }

// Expected worker output: the same wasip1 build trained on the card-aware
// conversion (the page runs with timezone UTC and next day at 4).
const wasip1 = createRequire(import.meta.url)(
  '@open-spaced-repetition/binding-wasm32-wasip1'
)
const expected = {}
const expectedWithoutIds = {}
for (const modelVersion of Object.keys(RUNS)) {
  const { items, cardIds } = wasip1.convertCsvToFsrsItemsWithCardIds(
    new TextEncoder().encode(csvText),
    4,
    'UTC',
    modelVersion
  )
  const train = (run, ids) =>
    wasip1.computeParameters(items, {
      modelVersion,
      enableShortTerm: true,
      ...run,
      ...(ids && { cardIds: ids }),
    })
  expected[modelVersion] = []
  expectedWithoutIds[modelVersion] = []
  for (const run of RUNS[modelVersion]) {
    expected[modelVersion].push(await train(run, cardIds))
    expectedWithoutIds[modelVersion].push(await train(run))
  }
}

// Local receiver for hash CSV downloads and callbacks; nothing leaves the host.
const received = []
const receiver = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.method === 'GET') return res.end(csvText)
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    received.push({ origin: req.headers.origin, body: JSON.parse(body) })
    res.end('ok')
  })
})

let appDir
let server
let browser
let context
let page
let navigation
const wasmResponses = []
const pageErrors = []

async function openPage(url) {
  const p = await context.newPage()
  p.on('pageerror', (err) => pageErrors.push(err))
  const response = await p.goto(url)
  return { p, response }
}

before(async () => {
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  appDir = buildStandalone()
  server = await startServer(appDir)
  browser = await chromium.launch()
  context = await browser.newContext({ timezoneId: 'UTC' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: server.baseUrl,
  })
  // Observe (not replace) the app's worker messages.
  await context.addInitScript(() => {
    const NativeWorker = window.Worker
    window.__workers = 0
    window.__events = []
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args)
        window.__workers++
        this.addEventListener('message', (e) => window.__events.push(e.data))
      }
    }
  })
  context.on('response', (res) => {
    if (new URL(res.url()).pathname.endsWith('.wasm')) wasmResponses.push(res)
  })
  ;({ p: page, response: navigation } = await openPage(server.baseUrl))
})

after(async () => {
  await browser?.close()
  server?.stop()
  receiver.close()
  if (appDir) removeApp(appDir)
  rmSync(fixtureDir, { recursive: true, force: true })
})

const events = (type, p = page) =>
  p.evaluate((t) => window.__events.filter((e) => e.type === t), type)

const modelTrigger = () => page.locator('#model-version')

async function selectModel(modelVersion) {
  await modelTrigger().click()
  await page.getByRole('option', { name: modelVersion }).click()
  assert.equal(await modelTrigger().textContent(), modelVersion)
}

async function upload(file, expect) {
  const before = (await events(expect)).length
  const dropzone = page.locator('div.border-dashed')
  await page.waitForFunction(
    (el) => !el.className.includes('cursor-not-allowed'),
    await dropzone.elementHandle()
  )
  // Click like a user: react-dropzone clears the input before opening the
  // dialog, so re-selecting the same file still triggers a new run.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dropzone.click(),
  ])
  await chooser.setFiles(file)
  await page.waitForFunction(
    ([t, n]) => window.__events.filter((e) => e.type === t).length > n,
    [expect, before],
    { timeout: 120_000 }
  )
}

// Rendered results: the model row, both labels and both weight lists.
async function renderedResults(p = page) {
  await p.getByText('Train Results').waitFor()
  const model = await p
    .locator('dt', { hasText: 'Model Version' })
    .locator('+ dd')
    .textContent()
  const labels = await p
    .locator('dt', { hasText: 'Train Model' })
    .locator('+ dd')
    .allTextContents()
  const lists = await p
    .locator('ol.list-decimal')
    .evaluateAll((ols) =>
      ols.map((ol) =>
        [...ol.querySelectorAll('li')].map((li) => +li.textContent)
      )
    )
  return { model, labels, lists }
}

async function assertTrainedRun(runIndex, modelVersion) {
  const completes = (await events('training-complete')).slice(
    runIndex * 2,
    runIndex * 2 + 2
  )
  assert.deepEqual(
    completes.map(({ parameters, type, ...run }) => run),
    RUNS[modelVersion].map((run) => ({ modelVersion, ...run }))
  )
  completes.forEach(({ parameters }, i) => {
    assert.equal(parameters.length, WEIGHTS[modelVersion])
    assert.ok(parameters.every(Number.isFinite))
    // cardIds reached computeParameters.
    assert.deepEqual(parameters, expected[modelVersion][i])
    assert.notDeepEqual(parameters, expectedWithoutIds[modelVersion][i])
  })
  const progress = await events('progress')
  assert.ok(progress.some((e) => e.modelVersion === modelVersion))
  assert.deepEqual(await renderedResults(), {
    model: modelVersion,
    labels: LABELS[modelVersion],
    lists: expected[modelVersion],
  })
}

const VISUALIZER =
  'https://open-spaced-repetition.github.io/anki_fsrs_visualizer/'
const visualizerWeights = (w) => w.map((a) => a.toFixed(4)).join(',')

async function copyFirstResult() {
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await page.getByRole('button', { name: 'Copied!' }).waitFor()
  return page.evaluate(() => navigator.clipboard.readText())
}

test('page is served without cross-origin isolation', async () => {
  const headers = navigation.headers()
  assert.equal(headers['cross-origin-opener-policy'], undefined)
  assert.equal(headers['cross-origin-embedder-policy'], undefined)
  assert.equal(await page.evaluate(() => crossOriginIsolated), false)
})

test('model selector defaults to FSRS-6', async () => {
  assert.equal(await modelTrigger().textContent(), 'FSRS-6')
})

test('FSRS-6 trains short-term on/off in the worker', async () => {
  await upload(validCsv, 'done')
  const [converted] = await events('convert-complete')
  assert.ok(converted.fsrsItems > 0)
  await assertTrainedRun(0, 'FSRS-6')
  assert.ok(
    wasmResponses.some((r) => r.ok()),
    'wasm32-wasip1 module was not fetched'
  )

  const [w] = expected['FSRS-6']
  assert.equal(await copyFirstResult(), w.join(', '))
  await page
    .locator(`a[href="${VISUALIZER}?w=${visualizerWeights(w)}&m=0.9&e=1"]`)
    .waitFor()
})

test('FSRS-7 trains scheduling penalties on/off with the same worker', async () => {
  await selectModel('FSRS-7')
  await upload(validCsv, 'done')
  await assertTrainedRun(1, 'FSRS-7')
  assert.equal(await page.evaluate(() => window.__workers), 1)

  // Copy works; no visualizer link is offered for FSRS-7 weights.
  const [w] = expected['FSRS-7']
  assert.equal(await copyFirstResult(), w.join(', '))
  await sleep(500)
  assert.equal(
    await page.locator(`a[href*="w=${visualizerWeights(w)}&"]`).count(),
    0,
    'visualizer link offered for FSRS-7'
  )
})

test('results keep the trained model when the selector changes', async () => {
  await selectModel('FSRS-6')
  assert.deepEqual(await renderedResults(), {
    model: 'FSRS-7',
    labels: LABELS['FSRS-7'],
    lists: expected['FSRS-7'],
  })
  // A consecutive switch trains the newly selected model.
  await upload(validCsv, 'done')
  await assertTrainedRun(2, 'FSRS-6')
})

test('reports invalid CSV and recovers on retry', async () => {
  await selectModel('FSRS-7')
  await upload(invalidCsv, 'error')
  const [error] = await events('error')
  assert.match(error.message, /CSV deserialization error/)
  await page.getByText('Training failed').first().waitFor()
  assert.equal(await page.getByText('Train Results').count(), 0)

  await upload(validCsv, 'done')
  await assertTrainedRun(3, 'FSRS-7')
  assert.equal(await page.evaluate(() => window.__workers), 2)
})

for (const modelVersion of ['FSRS-6', 'FSRS-7']) {
  test(`${modelVersion} hash callback: direct and proxied bodies match`, async () => {
    const local = `http://127.0.0.1:${receiver.address().port}`
    const bodies = {}
    for (const callbackOnClient of ['1', '0']) {
      received.length = 0
      const hash = new URLSearchParams({
        csv: `${local}/revlog.csv`,
        fetchOnClient: '1',
        tz: 'UTC',
        nextDayStartAt: '4',
        callback: `${local}/hook`,
        callbackOnClient,
      })
      // Omitting modelVersion must keep the FSRS-6 default.
      if (modelVersion === 'FSRS-7') hash.set('modelVersion', modelVersion)
      const { p } = await openPage(`${server.baseUrl}/#${hash}`)
      for (let i = 0; i < 600 && received.length === 0; i++) await sleep(200)
      assert.equal(received.length, 1, 'callback was not received')
      const [{ origin, body }] = received
      // Direct callbacks come from the page, proxied ones from the server.
      assert.equal(
        origin,
        callbackOnClient === '1' ? server.baseUrl : undefined
      )
      assert.equal(
        await p.locator('#model-version').textContent(),
        modelVersion
      )
      assert.equal((await renderedResults(p)).model, modelVersion)
      bodies[callbackOnClient] = body
      await p.close()
    }

    const meta = {
      tz: 'UTC',
      nextDayStartAt: 4,
      total_rows: 0,
      total_cards: 0,
      total_fsrs_items: 0,
    }
    const [on, off] = expected[modelVersion]
    assert.deepEqual(
      bodies['1'],
      modelVersion === 'FSRS-7'
        ? {
            model_version: 'FSRS-7',
            ...meta,
            penalties_enabled_params: on,
            penalties_disabled_params: off,
          }
        : { ...meta, short_term_params: on, long_term_params: off }
    )
    assert.deepEqual(bodies['0'], bodies['1'])
    assert.deepEqual(pageErrors, [])
  })
}
