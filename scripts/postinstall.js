import fs from 'fs'
import path from 'path'

if (process.env.NODE_ENV === 'production') {
  process.exit(0)
}

const __dirname = path.dirname(new URL(import.meta.url).pathname)

// 读取 .wasm 文件并转换为 Base64
const wasmPath = path.join(__dirname, '..', 'node_modules', 'fsrs-browser', 'fsrs_browser_bg.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)
const wasmBase64 = wasmBuffer.toString('base64')

// 目标文件路径
const outputPath = path.join(__dirname, 'service', 'services', 'wasm.ts')

const dirPath = path.dirname(outputPath)
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true })
}

// 生成 Base64 字符串并写入到 wasm.ts 文件
const wasmTsContent = `
export const fsrsBrowserWasmBase64 = '${wasmBase64}'

export function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}
`

fs.writeFileSync(outputPath, wasmTsContent)

console.log(`Successfully converted fsrs_browser_bg.wasm to Base64 and wrote to service/services/wasm.ts`)

const timezones = Intl.supportedValuesOf('timeZone')
const timeZoneOutputPath = path.join(__dirname, '..', 'components', 'lib', 'timezones.ts')
const timeZoneOutputDirPath = path.dirname(timeZoneOutputPath)
if (!fs.existsSync(timeZoneOutputDirPath)) {
  fs.mkdirSync(timeZoneOutputDirPath, { recursive: true })
}

const timezonesContent = `
// https://stackoverflow.com/questions/38399465/how-to-get-list-of-all-timezones-in-javascript
// issues: https://github.com/ishiko732/fsrs-online-training/issues/4
export const timezones = ${JSON.stringify(timezones)}
`
fs.writeFileSync(timeZoneOutputPath, timezonesContent)
console.log(`Successfully wrote timezones to components/lib/timezones.ts`)
