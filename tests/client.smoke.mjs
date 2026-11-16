// Real-browser smoke of the shipped app: the page's own dedicated Worker loads
// wasm32-wasip1 without cross-origin isolation, trains both short-term
// settings twice in a row, reports an invalid CSV, and recovers on retry.
// Run with `pnpm run test:client` (once: `pnpm exec playwright install chromium`).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright'

import { buildStandalone, removeApp, startServer } from './app.mjs'
import { INVALID_CSV, syntheticRevlogCsv } from './fixtures.mjs'

const fixtureDir = mkdtempSync(join(tmpdir(), 'fsrs-csv-'))
const validCsv = join(fixtureDir, 'revlog.csv')
const invalidCsv = join(fixtureDir, 'invalid.csv')
writeFileSync(validCsv, syntheticRevlogCsv({ cards: 400 }))
writeFileSync(invalidCsv, INVALID_CSV)

let appDir
let server
let browser
let page
let navigation
const wasmResponses = []
const pageErrors = []

before(async () => {
  appDir = buildStandalone()
  server = await startServer(appDir)
  browser = await chromium.launch()
  const context = await browser.newContext()
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
  page = await context.newPage()
  page.on('pageerror', (err) => pageErrors.push(err))
  navigation = await page.goto(server.baseUrl)
})

after(async () => {
  await browser?.close()
  server?.stop()
  if (appDir) removeApp(appDir)
  rmSync(fixtureDir, { recursive: true, force: true })
})

const events = (type) =>
  page.evaluate((t) => window.__events.filter((e) => e.type === t), type)

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

async function assertTrainedRun(runIndex) {
  const completes = (await events('training-complete')).slice(runIndex * 2)
  assert.deepEqual(
    completes.map((e) => e.enableShortTerm),
    [true, false]
  )
  for (const { parameters } of completes) {
    assert.equal(parameters.length, 21)
    assert.ok(parameters.every(Number.isFinite))
  }
  await page.getByText('Train Results').waitFor()
  const lists = await page
    .locator('ol.list-decimal')
    .evaluateAll((ols) =>
      ols.map((ol) =>
        [...ol.querySelectorAll('li')].map((li) => +li.textContent)
      )
    )
  assert.equal(lists.length, 2)
  for (const values of lists) {
    assert.equal(values.length, 21)
    assert.ok(values.every(Number.isFinite))
  }
}

test('page is served without cross-origin isolation', async () => {
  const headers = navigation.headers()
  assert.equal(headers['cross-origin-opener-policy'], undefined)
  assert.equal(headers['cross-origin-embedder-policy'], undefined)
  assert.equal(await page.evaluate(() => crossOriginIsolated), false)
})

test('trains both short-term settings in the worker', async () => {
  await upload(validCsv, 'done')
  const [converted] = await events('convert-complete')
  assert.ok(converted.fsrsItems > 0)
  assert.ok((await events('progress')).length > 0)
  await assertTrainedRun(0)
  assert.ok(
    wasmResponses.some((r) => r.ok()),
    'wasm32-wasip1 module was not fetched'
  )
})

test('trains again with the same worker', async () => {
  await upload(validCsv, 'done')
  await assertTrainedRun(1)
  assert.equal(await page.evaluate(() => window.__workers), 1)
})

test('reports invalid CSV and recovers on retry', async () => {
  await upload(invalidCsv, 'error')
  const [error] = await events('error')
  assert.match(error.message, /CSV deserialization error/)
  await page.getByText('Training failed').first().waitFor()
  assert.equal(await page.getByText('Train Results').count(), 0)

  await upload(validCsv, 'done')
  await assertTrainedRun(2)
  assert.equal(await page.evaluate(() => window.__workers), 2)
  assert.deepEqual(pageErrors, [])
})
