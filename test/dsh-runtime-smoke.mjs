import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const pluginEntry = process.env.PLUGIN_ENTRY
const plugin = pluginEntry ? await import(pathToFileURL(resolve(pluginEntry)).href) : await import('../index.js')
const checkout = process.env.DSH_CHECKOUT
if (!checkout) throw new Error('DSH_CHECKOUT must point to a built DeepSeek Harness checkout')
const importBuilt = async (relativePath) => import(pathToFileURL(resolve(checkout, relativePath)).href)
const { Context } = await importBuilt('vendor/cordis/lib/index.js')
const { default: SystemPrompt } = await importBuilt('packages/core/system-prompt/lib/index.js')
const { default: ToolRuntime } = await importBuilt('packages/core/tools/lib/index.js')
const root = await mkdtemp(join(tmpdir(), 'dsh-cad-runtime-'))
await copyFile(new URL('fixtures/problematic.dxf', import.meta.url), join(root, 'problematic.dxf'))
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(plugin, { workspaceRoot: root, policy: { forbiddenLayers: ['DEFPOINTS'], requireClosedPolylines: true, minTextHeight: 2.5, requiredInsUnits: 4 } })
  const tools = ctx.get('tools')
  const schemas = tools.schemas()
  assert.deepEqual(schemas.filter(({ name }) => name.startsWith('dsh_cad_')).map(({ name }) => name), ['dsh_cad_inspect_dxf', 'dsh_cad_review_dxf'])
  const signal = new AbortController().signal
  const inspection = await tools.execute({ signal, callId: 'cad-inspect-smoke', name: 'dsh_cad_inspect_dxf', arguments: { path: 'problematic.dxf' } })
  assert.equal(inspection.isError, false)
  assert.equal(inspection.value.entityCount, 3)
  assert.equal(JSON.stringify(inspection.value).includes('TOO SMALL'), false)
  const review = await tools.execute({ signal, callId: 'cad-review-smoke', name: 'dsh_cad_review_dxf', arguments: { path: 'problematic.dxf' } })
  assert.equal(review.isError, false)
  assert.equal(review.value.passed, false)
  assert.deepEqual(review.value.counts, { error: 2, warning: 2, info: 0 })
  assert.equal(JSON.stringify(review.value).includes('TOO SMALL'), false)
  process.stdout.write(`${JSON.stringify({ ok: true, tools: schemas.filter(({ name }) => name.startsWith('dsh_cad_')).map(({ name }) => name), entityCount: inspection.value.entityCount, issueCount: review.value.issueCount, rawTextIncluded: false })}\n`)
} finally {
  await ctx.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
