#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { inspectDxf, reviewDxfFile } from '../lib/dxf.mjs'

const args = process.argv.slice(2)
const command = args[0]
const valueAfter = flag => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

try {
  const file = args[1]
  if (!file || !['inspect', 'review'].includes(command)) {
    console.log('Usage: dsh-cad-review <inspect|review> drawing.dxf [--policy policy.json]')
    process.exit(command === '--help' || command === undefined ? 0 : 1)
  }
  const absolute = resolve(file)
  const options = { workspaceRoot: dirname(absolute), path: absolute.split(/[\\/]/).at(-1) }
  const policyFile = valueAfter('--policy')
  const result = command === 'inspect'
    ? await inspectDxf(options)
    : await reviewDxfFile({ ...options, policy: policyFile ? JSON.parse(await readFile(resolve(policyFile), 'utf8')) : {} })
  console.log(JSON.stringify(result, null, 2))
  if (result.passed === false) process.exitCode = 2
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
}
