import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import os from 'os'

const userAgent = process.env.npm_config_user_agent || ''
let packageManager

if (userAgent.includes('pnpm')) {
  packageManager = 'pnpm'
} else if (userAgent.includes('yarn')) {
  packageManager = 'yarn'
} else if (userAgent.includes('bun')) {
  packageManager = 'bun'
} else {
  packageManager = 'npm'
}

function isMusl() {
  if (!process.report || typeof process.report.getReport !== 'function') {
    try {
      const lddPath = execSync('which ldd').toString().trim()
      return readFileSync(lddPath, 'utf8').includes('musl')
    } catch {
      return true
    }
  } else {
    const { glibcVersionRuntime } = process.report.getReport().header
    return !glibcVersionRuntime
  }
}

const platform = os.platform()
const arch = os.arch()
let packageToInstall

try {
  switch (platform) {
    case 'android':
      if (arch === 'arm64') {
        packageToInstall = 'fsrs-rs-nodejs-android-arm64'
      } else if (arch === 'arm') {
        packageToInstall = 'fsrs-rs-nodejs-android-arm-eabi'
      } else {
        throw new Error(`Unsupported architecture on Android: ${arch}`)
      }
      break
    case 'win32':
      if (arch === 'x64') {
        packageToInstall = 'fsrs-rs-nodejs-win32-x64-msvc'
      } else if (arch === 'ia32') {
        packageToInstall = 'fsrs-rs-nodejs-win32-ia32-msvc'
      } else if (arch === 'arm64') {
        packageToInstall = 'fsrs-rs-nodejs-win32-arm64-msvc'
      } else {
        throw new Error(`Unsupported architecture on Windows: ${arch}`)
      }
      break
    case 'darwin':
      if (arch === 'x64') {
        packageToInstall = 'fsrs-rs-nodejs-darwin-x64'
      } else if (arch === 'arm64') {
        packageToInstall = 'fsrs-rs-nodejs-darwin-arm64'
      } else {
        throw new Error(`Unsupported architecture on macOS: ${arch}`)
      }
      break
    case 'freebsd':
      if (arch === 'x64') {
        packageToInstall = 'fsrs-rs-nodejs-freebsd-x64'
      } else {
        throw new Error(`Unsupported architecture on FreeBSD: ${arch}`)
      }
      break
    case 'linux':
      if (arch === 'x64') {
        packageToInstall = isMusl() ? 'fsrs-rs-nodejs-linux-x64-musl' : 'fsrs-rs-nodejs-linux-x64-gnu' /** vercel */
      } else if (arch === 'arm64') {
        packageToInstall = isMusl() ? 'fsrs-rs-nodejs-linux-arm64-musl' : 'fsrs-rs-nodejs-linux-arm64-gnu'
      } else if (arch === 'arm') {
        packageToInstall = isMusl() ? 'fsrs-rs-nodejs-linux-arm-musleabihf' : 'fsrs-rs-nodejs-linux-arm-gnueabihf'
      } else if (arch === 'riscv64') {
        packageToInstall = isMusl() ? 'fsrs-rs-nodejs-linux-riscv64-musl' : 'fsrs-rs-nodejs-linux-riscv64-gnu'
      } else if (arch === 's390x') {
        packageToInstall = 'fsrs-rs-nodejs-linux-s390x-gnu'
      } else {
        throw new Error(`Unsupported architecture on Linux: ${arch}`)
      }
      break
    default:
      throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`)
  }

  console.log(`Installing ${packageToInstall} using ${packageManager}`)
  const installCommand = `${packageManager} ${packageManager === 'yarn' ? 'add' : 'install'} ${packageToInstall}`
  execSync(installCommand, { stdio: 'inherit' })

  console.log(`Successfully installed ${packageToInstall}`)
} catch (error) {
  console.error(`Failed to install ${packageToInstall}:`, error)
  process.exit(1)
}
