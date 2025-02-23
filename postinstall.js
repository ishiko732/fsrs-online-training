import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

// 读取 .wasm 文件并转换为 Base64
const wasmPath = path.join(__dirname, 'node_modules', 'fsrs-browser', 'fsrs_browser_bg.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)
const wasmBase64 = wasmBuffer.toString('base64')

// 目标文件路径
const outputPath = path.join(__dirname, 'service', 'services', 'wasm.ts')

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
