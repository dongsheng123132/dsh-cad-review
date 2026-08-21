import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectDxf, loadDxf, parseDxf, reviewDxf, reviewDxfFile, summarizeDxf } from '../lib/dxf.mjs'

const fixtureUrl = new URL('fixtures/problematic.dxf', import.meta.url)
const strictPolicy = JSON.parse(await readFile(new URL('../examples/strict-mm-policy.json', import.meta.url), 'utf8'))

test('parser extracts declared units, exact entity locations and drawing bounds', async () => {
  const parsed = parseDxf(await readFile(fixtureUrl, 'utf8'))
  const summary = summarizeDxf(parsed)
  assert.deepEqual(summary.units, { code: 4, name: 'millimeter' })
  assert.deepEqual(summary.entityTypes, { LINE: 1, LWPOLYLINE: 1, TEXT: 1 })
  assert.deepEqual(summary.layers, { DEFPOINTS: 1, WALL: 1, NOTE: 1 })
  assert.deepEqual(summary.entityEvidence[0].location, [5, 5, 0])
  assert.deepEqual(summary.bounds.span, [100, 100, 0])
  assert.equal(summary.extractionComplete, true)
  assert.equal(JSON.stringify(summary).includes('TOO SMALL'), false)
  assert.equal(summary.entityEvidence[2].geometry.textLength, 9)
  assert.equal(summary.entityEvidence[2].geometry.textSha256.length, 64)
})

test('malformed numeric tokens are disclosed by hash and length, not copied', () => {
  const parsed = parseDxf('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\nnot-a-secret-number\n20\n0\n11\n1\n21\n1\n0\nENDSEC\n0\nEOF\n')
  assert.equal(parsed.warnings.length, 1)
  assert.equal(parsed.warnings[0].evidence.valueLength, 19)
  assert.equal(parsed.warnings[0].evidence.valueSha256.length, 64)
  assert.equal(JSON.stringify(parsed.warnings).includes('not-a-secret-number'), false)
})

test('policy review reports deterministic issues with entity and coordinate evidence', async () => {
  const parsed = parseDxf(await readFile(fixtureUrl, 'utf8'))
  const report = reviewDxf(parsed, strictPolicy)
  assert.equal(report.passed, false)
  assert.deepEqual(report.counts, { error: 2, warning: 2, info: 0 })
  assert.deepEqual(report.issues.map(issue => issue.ruleId), [
    'CAD-LAYER-FORBIDDEN',
    'CAD-ZERO-LENGTH',
    'CAD-POLYLINE-OPEN',
    'CAD-TEXT-HEIGHT'
  ])
  assert.deepEqual(report.issues[0].evidence.location, [5, 5, 0])
  assert.equal(report.issues[0].evidence.handle, '10A')
  assert.ok(Number.isInteger(report.issues[0].evidence.lineStart))
})

test('file review attaches source path and sha256 to every issue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cad-file-'))
  await writeFile(join(root, 'problematic.dxf'), await readFile(fixtureUrl))
  const report = await reviewDxfFile({ workspaceRoot: root, path: 'problematic.dxf', policy: strictPolicy })
  assert.equal(report.sha256.length, 64)
  assert.equal(report.source, 'problematic.dxf')
  assert.ok(report.issues.every(issue => issue.evidence.sourceSha256 === report.sha256))
  assert.ok(report.issues.every(issue => issue.evidence.sourcePath === report.source))
})

test('unsupported entities and invalid radii remain explicit evidence gaps', () => {
  const parsed = parseDxf('0\nSECTION\n2\nENTITIES\n0\nDIMENSION\n5\nA\n8\n0\n0\nCIRCLE\n5\nB\n8\n0\n10\n0\n20\n0\n40\n0\n0\nENDSEC\n0\nEOF\n')
  const summary = summarizeDxf(parsed)
  assert.equal(summary.extractionComplete, false)
  assert.deepEqual(summary.unsupportedEntityTypes, { DIMENSION: 1 })
  assert.deepEqual(reviewDxf(parsed).issues.map(issue => issue.ruleId), ['CAD-RADIUS', 'CAD-UNSUPPORTED-ENTITY'])
})

test('loader refuses traversal, symlink escape, binary content and oversize files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cad-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'dsh-cad-outside-'))
  await writeFile(join(outside, 'outside.dxf'), '0\nEOF\n')
  await assert.rejects(() => loadDxf({ workspaceRoot: root, path: '../outside.dxf' }), /must not escape/)
  await symlink(join(outside, 'outside.dxf'), join(root, 'linked.dxf'))
  await assert.rejects(() => loadDxf({ workspaceRoot: root, path: 'linked.dxf' }), /outside/)
  await writeFile(join(root, 'binary.dxf'), Buffer.from([0, 1, 2]))
  await assert.rejects(() => inspectDxf({ workspaceRoot: root, path: 'binary.dxf' }), /binary DXF/)
  await writeFile(join(root, 'large.dxf'), '0\nEOF\n')
  await assert.rejects(() => loadDxf({ workspaceRoot: root, path: 'large.dxf', maxBytes: 1 }), /exceeds maxBytes/)
})
