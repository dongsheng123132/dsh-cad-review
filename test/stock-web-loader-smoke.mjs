import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const checkout = process.env.DSH_CHECKOUT
const dshHome = process.env.DSH_HOME
const nodeExecutable = process.env.NODE_EXECUTABLE || process.execPath
const timeoutMs = Number.parseInt(process.env.DSH_BOOT_TIMEOUT_MS || '60000', 10)
if (!checkout) throw new Error('DSH_CHECKOUT must point to a built DeepSeek Harness checkout')
if (!dshHome) throw new Error('DSH_HOME must point to an isolated profile containing this plugin')
const safeEnv = Object.fromEntries(['ComSpec', 'SystemDrive', 'SystemRoot', 'TEMP', 'TMP', 'PATH', 'PATHEXT'].flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []))
safeEnv.DSH_HOME = resolve(dshHome)
safeEnv.NODE_NO_WARNINGS = '1'
const child = spawn(nodeExecutable, [resolve(checkout, 'apps/cli/lib/bin.js'), '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], { cwd: resolve(checkout), env: safeEnv, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-262144) })
child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-262144) })
const exit = new Promise((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done({ code, signal })) })
let readinessUrl
const deadline = Date.now() + timeoutMs
while (!readinessUrl && Date.now() < deadline && child.exitCode === null) {
  readinessUrl = stdout.match(/https?:\/\/127\.0\.0\.1:\d+/)?.[0]
  if (!readinessUrl) await new Promise((done) => setTimeout(done, 100))
}
if (child.exitCode === null) child.kill()
const ended = await exit
assert.ok(readinessUrl, `stock Web profile did not become ready; exit=${ended.code ?? ended.signal}; stderr=${stderr.slice(-4000)}`)
assert.doesNotMatch(stderr, /cannot get property ["']tools["'] without inject/i)
process.stdout.write(`${JSON.stringify({ ok: true, profile: 'web', loader: 'real-cordis', readinessUrl, sanitizedEnvironment: true })}\n`)
