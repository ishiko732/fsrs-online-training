// Builds and runs the shipped app like the Dockerfile: a standalone production
// build copied outside the repo (so it cannot fall back to the repo's
// node_modules) and served by `node server.js`.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = resolve(import.meta.dirname, '..')

// Returns the app directory; clean it up with removeApp().
export function buildStandalone() {
  const result = spawnSync('pnpm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NEXT_PRIVATE_STANDALONE: 'true' },
  })
  if (result.status !== 0) throw new Error('standalone build failed')
  const appDir = realpathSync(mkdtempSync(join(tmpdir(), 'fsrs-app-')))
  const copy = (from, to) =>
    cpSync(join(root, from), join(appDir, to), {
      recursive: true,
      verbatimSymlinks: true,
    })
  copy('.next/standalone', '.')
  copy('public', 'public')
  copy('.next/static', '.next/static')
  return appDir
}

export const removeApp = (appDir) =>
  rmSync(appDir, { recursive: true, force: true })

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

export async function startServer(appDir) {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const stop = () => child.kill('SIGTERM')
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('server exited early')
    try {
      const res = await fetch(`${baseUrl}/api/support/timezones`)
      if (res.ok) return { baseUrl, stop }
    } catch {}
    await sleep(200)
  }
  stop()
  throw new Error('server did not become ready')
}
