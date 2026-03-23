#!/usr/bin/env node
import cp from 'child_process'
import fs from 'fs'
import path from 'path'

const base = path.resolve('node_modules')
const target = path.resolve('.next/standalone/node_modules')

fs.readdirSync(`${base}/.pnpm`).forEach((pkg) => {
  if (pkg.includes('open-spaced-repetition')) {
    const src = path.join(`${base}/.pnpm`, pkg)
    const dst = path.join(`${target}/.pnpm`, pkg)
    console.log(`Copying ${src} to ${dst}`)
    cp.execSync(`cp -r ${src} ${dst}`)
  }
})

const scopedDir = path.join(base, '@open-spaced-repetition')
if (fs.existsSync(scopedDir)) {
  const targetScopedDir = path.join(target, '@open-spaced-repetition')
  if (!fs.existsSync(targetScopedDir)) {
    fs.mkdirSync(targetScopedDir, { recursive: true })
  }
  fs.readdirSync(scopedDir).forEach((pkg) => {
    const src = path.join(scopedDir, pkg)
    const dst = path.join(targetScopedDir, pkg)
    console.log(`Copying ${src} to ${dst}`)
    cp.execSync(`cp -a ${src} ${dst}`)
  })
}
