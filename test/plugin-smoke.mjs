import assert from 'node:assert/strict'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from '../index.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-cad-plugin-'))
await copyFile(new URL('fixtures/problematic.dxf', import.meta.url), join(root, 'problematic.dxf'))
const tools = plugin.createDefinitions({}, {
  workspaceRoot: root,
  policy: { forbiddenLayers: ['DEFPOINTS'], requireClosedPolylines: true, minTextHeight: 2.5, requiredInsUnits: 4 }
})
assert.deepEqual(tools.map(tool => tool.name), ['dsh_cad_inspect_dxf', 'dsh_cad_review_dxf'])
assert.deepEqual(plugin.inject, ['tools'])
assert.equal('default' in plugin, false)
const inspection = await tools[0].execute({ path: 'problematic.dxf' })
assert.equal(inspection.entityCount, 3)
assert.equal(inspection.sha256.length, 64)
assert.equal(JSON.stringify(inspection).includes('TOO SMALL'), false)
const review = await tools[1].execute({ path: 'problematic.dxf' })
assert.equal(review.passed, false)
assert.ok(review.issues.every(issue => issue.evidence.sourceSha256 === review.sha256))
const override = await tools[1].execute({ path: 'problematic.dxf', policyJson: JSON.stringify({ minTextHeight: 0 }) })
assert.equal(override.issues.some(issue => issue.ruleId === 'CAD-TEXT-HEIGHT'), false)
console.log(JSON.stringify({ ok: true, hostNeutral: true, rawTextIncluded: false, tools: tools.map(tool => tool.name), entities: inspection.entityCount, issues: review.issueCount }))
