#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import cp from 'child_process'

const base = path.resolve('node_modules')
const target = path.resolve('.next/standalone/node_modules')

fs.readdirSync(`${base}/.pnpm`).forEach((pkg) => {
  if (pkg.includes('fsrs-rs-nodejs')) {
    const src = path.join(`${base}/.pnpm`, pkg)
    const dst = path.join(`${target}/.pnpm`, pkg)
    console.log(`Copying ${src} to ${dst}`)
    cp.execSync(`cp -r ${src} ${dst}`)
  }
})

fs.readdirSync(base).forEach((pkg) => {
  if (pkg.includes('fsrs-rs-nodejs')) {
    const src = path.join(base, pkg)
    const dst = path.join(target, pkg)
    console.log(`Copying ${src} to ${dst}`)
    cp.execSync(`cp -a ${src} ${dst}`)
  }
})

