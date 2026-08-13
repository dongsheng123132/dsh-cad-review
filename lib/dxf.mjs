import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const UNIT_NAMES = Object.freeze({
  0: 'unitless', 1: 'inch', 2: 'foot', 3: 'mile', 4: 'millimeter', 5: 'centimeter',
  6: 'meter', 7: 'kilometer', 8: 'microinch', 9: 'mil', 10: 'yard', 14: 'decimeter'
})
const RULE_IDS = new Set([
  'CAD-PARSE-NUMBER', 'CAD-ZERO-LENGTH', 'CAD-LAYER-REQUIRED', 'CAD-LAYER-FORBIDDEN',
  'CAD-ENTITY-FORBIDDEN', 'CAD-POLYLINE-OPEN', 'CAD-TEXT-HEIGHT', 'CAD-DRAWING-SPAN',
  'CAD-UNITS', 'CAD-ENTITY-LIMIT', 'CAD-UNSUPPORTED-ENTITY', 'CAD-RADIUS',
  'CAD-POLYLINE-VERTEX-COUNT', 'CAD-DUPLICATE-GEOMETRY'
])

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function isInside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function assertRelativeDxf(value) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) throw new Error('path must be a non-empty relative path')
  if (value.replaceAll('\\', '/').split('/').includes('..')) throw new Error('path must not escape workspaceRoot')
  if (extname(value).toLowerCase() !== '.dxf') throw new Error('only .dxf files are supported')
  return value
}

function parsePairs(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  while (lines.length && lines.at(-1).trim() === '') lines.pop()
  if (lines.length % 2 !== 0) throw new Error(`invalid ASCII DXF: unpaired group-code line ${lines.length}`)
  const pairs = []
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10)
    if (!Number.isInteger(code)) throw new Error(`invalid ASCII DXF group code at line ${index + 1}`)
    pairs.push({ code, value: lines[index + 1].trim(), codeLine: index + 1, valueLine: index + 2 })
  }
  return pairs
}

function first(entity, code) {
  return entity.pairs.find(pair => pair.code === code)
}

function all(entity, code) {
  return entity.pairs.filter(pair => pair.code === code)
}

function finite(pair, entity, warnings, label) {
  if (!pair) return null
  const value = Number(pair.value)
  if (Number.isFinite(value)) return value
  warnings.push({
    ruleId: 'CAD-PARSE-NUMBER', severity: 'error', message: `${label} is not finite`,
    evidence: evidence(entity, { line: pair.valueLine, value: pair.value })
  })
  return null
}

function entityLocation(entity) {
  const geometry = entity?.geometry
  if (!geometry) return null
  if (geometry.kind === 'line' && geometry.start?.every(Number.isFinite) && geometry.end?.every(Number.isFinite)) {
    return geometry.start.map((value, index) => (value + geometry.end[index]) / 2)
  }
  if (geometry.kind === 'polyline') {
    const points = geometry.vertices.filter(point => point?.every(Number.isFinite))
    if (!points.length) return null
    return [0, 1, 2].map(axis => points.reduce((sum, point) => sum + point[axis], 0) / points.length)
  }
  if (geometry.kind === 'circle' || geometry.kind === 'arc') return geometry.center?.every(Number.isFinite) ? geometry.center : null
  if (geometry.kind === 'text') return geometry.insertion?.every(Number.isFinite) ? geometry.insertion : null
  if (geometry.kind === 'point' || geometry.kind === 'insert') return geometry.point?.every(Number.isFinite) ? geometry.point : null
  return null
}

function evidence(entity, extra = {}) {
  return {
    entityIndex: entity?.index ?? null,
    entityType: entity?.type ?? null,
    handle: entity?.handle ?? null,
    layer: entity?.layer ?? null,
    lineStart: entity?.lineStart ?? null,
    lineEnd: entity?.lineEnd ?? null,
    location: entityLocation(entity),
    ...extra
  }
}

function entityGeometry(entity, warnings) {
  const number = (code, label = `group ${code}`) => finite(first(entity, code), entity, warnings, label)
  if (entity.type === 'LINE') {
    return { kind: 'line', start: [number(10, 'start.x'), number(20, 'start.y'), number(30, 'start.z') ?? 0], end: [number(11, 'end.x'), number(21, 'end.y'), number(31, 'end.z') ?? 0] }
  }
  if (entity.type === 'LWPOLYLINE') {
    const xs = all(entity, 10)
    const ys = all(entity, 20)
    const vertices = xs.map((pair, index) => [finite(pair, entity, warnings, `vertex[${index}].x`), finite(ys[index], entity, warnings, `vertex[${index}].y`), 0])
    const flags = Number.parseInt(first(entity, 70)?.value ?? '0', 10) || 0
    return { kind: 'polyline', vertices, closed: (flags & 1) === 1, declaredVertices: Number.parseInt(first(entity, 90)?.value ?? String(vertices.length), 10) }
  }
  if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    return { kind: entity.type.toLowerCase(), center: [number(10, 'center.x'), number(20, 'center.y'), number(30, 'center.z') ?? 0], radius: number(40, 'radius') }
  }
  if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
    return { kind: 'text', insertion: [number(10, 'insertion.x'), number(20, 'insertion.y'), number(30, 'insertion.z') ?? 0], height: number(40, 'text height'), text: first(entity, 1)?.value ?? '' }
  }
  if (entity.type === 'POINT' || entity.type === 'INSERT') {
    return { kind: entity.type.toLowerCase(), point: [number(10, 'point.x'), number(20, 'point.y'), number(30, 'point.z') ?? 0] }
  }
  return { kind: 'unsupported' }
}

function geometryPoints(geometry) {
  if (geometry.kind === 'line') return [geometry.start, geometry.end]
  if (geometry.kind === 'polyline') return geometry.vertices
  if (geometry.kind === 'text') return [geometry.insertion]
  if (geometry.kind === 'point' || geometry.kind === 'insert') return [geometry.point]
  if ((geometry.kind === 'circle' || geometry.kind === 'arc') && geometry.center.every(Number.isFinite) && Number.isFinite(geometry.radius)) {
    return [[geometry.center[0] - geometry.radius, geometry.center[1] - geometry.radius, geometry.center[2]], [geometry.center[0] + geometry.radius, geometry.center[1] + geometry.radius, geometry.center[2]]]
  }
  return []
}

function calculateBounds(entities) {
  const points = entities.flatMap(entity => geometryPoints(entity.geometry)).filter(point => point?.slice(0, 2).every(Number.isFinite))
  if (points.length === 0) return null
  const min = [0, 1, 2].map(axis => Math.min(...points.map(point => Number.isFinite(point[axis]) ? point[axis] : 0)))
  const max = [0, 1, 2].map(axis => Math.max(...points.map(point => Number.isFinite(point[axis]) ? point[axis] : 0)))
  return { min, max, span: max.map((value, axis) => value - min[axis]) }
}

export function parseDxf(text) {
  const pairs = parsePairs(text)
  const headers = new Map()
  const entities = []
  const warnings = []
  let section = null
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    if (pair.code === 0 && pair.value === 'SECTION') {
      section = pairs[index + 1]?.code === 2 ? pairs[index + 1].value : null
      continue
    }
    if (pair.code === 0 && pair.value === 'ENDSEC') {
      section = null
      continue
    }
    if (section === 'HEADER' && pair.code === 9) {
      const values = []
      for (let cursor = index + 1; cursor < pairs.length && pairs[cursor].code !== 9 && pairs[cursor].code !== 0; cursor += 1) values.push(pairs[cursor])
      headers.set(pair.value, values)
    }
    if (section === 'ENTITIES' && pair.code === 0 && !['SECTION', 'ENDSEC', 'EOF'].includes(pair.value)) {
      let end = index + 1
      while (end < pairs.length && pairs[end].code !== 0) end += 1
      const entityPairs = pairs.slice(index, end)
      const entity = {
        index: entities.length,
        type: pair.value.toUpperCase(),
        handle: entityPairs.find(item => item.code === 5)?.value ?? null,
        layer: entityPairs.find(item => item.code === 8)?.value ?? '0',
        lineStart: pair.codeLine,
        lineEnd: entityPairs.at(-1)?.valueLine ?? pair.valueLine,
        pairs: entityPairs
      }
      entity.geometry = entityGeometry(entity, warnings)
      entities.push(entity)
      index = end - 1
    }
  }
  const insUnitsPair = headers.get('$INSUNITS')?.find(pair => pair.code === 70)
  const insUnits = insUnitsPair ? Number.parseInt(insUnitsPair.value, 10) : null
  return {
    format: 'ascii-dxf',
    insUnits: Number.isInteger(insUnits) ? { code: insUnits, name: UNIT_NAMES[insUnits] ?? 'other' } : null,
    entities,
    warnings,
    bounds: calculateBounds(entities)
  }
}

export function summarizeDxf(parsed, { maxEntityEvidence = 200 } = {}) {
  const entityTypes = {}
  const layers = {}
  for (const entity of parsed.entities) {
    entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1
    layers[entity.layer] = (layers[entity.layer] || 0) + 1
  }
  const evidenceRows = parsed.entities.slice(0, maxEntityEvidence).map(entity => ({
    entityIndex: entity.index, type: entity.type, handle: entity.handle, layer: entity.layer,
    lineStart: entity.lineStart, lineEnd: entity.lineEnd, location: entityLocation(entity), geometry: entity.geometry
  }))
  const unsupportedEntityTypes = Object.fromEntries(Object.entries(entityTypes).filter(([type]) => parsed.entities.some(entity => entity.type === type && entity.geometry.kind === 'unsupported')))
  return {
    format: parsed.format,
    units: parsed.insUnits,
    entityCount: parsed.entities.length,
    entityTypes,
    layers,
    bounds: parsed.bounds,
    parseIssues: parsed.warnings,
    extractionComplete: Object.keys(unsupportedEntityTypes).length === 0,
    unsupportedEntityTypes,
    entityEvidence: evidenceRows,
    evidenceTruncated: parsed.entities.length > evidenceRows.length
  }
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('policy must be an object')
  const allowed = new Set(['requiredLayers', 'forbiddenLayers', 'forbiddenEntityTypes', 'requireClosedPolylines', 'minTextHeight', 'maxDrawingSpan', 'requiredInsUnits', 'maxEntities', 'maxIssues', 'severityOverrides'])
  const unknown = Object.keys(policy).filter(key => !allowed.has(key))
  if (unknown.length) throw new Error(`unknown policy fields: ${unknown.join(', ')}`)
  for (const field of ['requiredLayers', 'forbiddenLayers', 'forbiddenEntityTypes']) {
    if (policy[field] !== undefined && (!Array.isArray(policy[field]) || policy[field].some(item => typeof item !== 'string'))) throw new Error(`${field} must be an array of strings`)
  }
  for (const field of ['minTextHeight', 'maxDrawingSpan', 'maxEntities', 'maxIssues', 'requiredInsUnits']) {
    if (policy[field] !== undefined && !Number.isFinite(policy[field])) throw new Error(`${field} must be a finite number`)
  }
  if (policy.requireClosedPolylines !== undefined && typeof policy.requireClosedPolylines !== 'boolean') throw new Error('requireClosedPolylines must be boolean')
  for (const [id, severity] of Object.entries(policy.severityOverrides || {})) {
    if (!RULE_IDS.has(id)) throw new Error(`unknown severity override rule: ${id}`)
    if (!['info', 'warning', 'error'].includes(severity)) throw new Error(`invalid severity for ${id}`)
  }
  return policy
}

export function reviewDxf(parsed, rawPolicy = {}) {
  const policy = validatePolicy(rawPolicy)
  const issues = [...parsed.warnings]
  const severity = (ruleId, fallback) => policy.severityOverrides?.[ruleId] ?? fallback
  const add = (ruleId, fallback, message, itemEvidence) => issues.push({ ruleId, severity: severity(ruleId, fallback), message, evidence: itemEvidence })

  const geometrySeen = new Map()
  for (const entity of parsed.entities) {
    if (entity.geometry.kind === 'unsupported') {
      add('CAD-UNSUPPORTED-ENTITY', 'warning', `entity type ${entity.type} is not structurally reviewed`, evidence(entity))
    }
    if (entity.geometry.kind === 'line' && entity.geometry.start.every(Number.isFinite) && entity.geometry.end.every(Number.isFinite) && entity.geometry.start.every((value, index) => value === entity.geometry.end[index])) {
      add('CAD-ZERO-LENGTH', 'error', 'LINE start and end are identical', evidence(entity, { start: entity.geometry.start, end: entity.geometry.end }))
    }
    if (policy.requireClosedPolylines && entity.geometry.kind === 'polyline' && !entity.geometry.closed) {
      add('CAD-POLYLINE-OPEN', 'warning', 'LWPOLYLINE is open but policy requires closed polylines', evidence(entity, { vertexCount: entity.geometry.vertices.length }))
    }
    if (entity.geometry.kind === 'polyline' && entity.geometry.declaredVertices !== entity.geometry.vertices.length) {
      add('CAD-POLYLINE-VERTEX-COUNT', 'error', `declared vertex count ${entity.geometry.declaredVertices} differs from extracted count ${entity.geometry.vertices.length}`, evidence(entity, { declared: entity.geometry.declaredVertices, extracted: entity.geometry.vertices.length }))
    }
    if ((entity.geometry.kind === 'circle' || entity.geometry.kind === 'arc') && Number.isFinite(entity.geometry.radius) && entity.geometry.radius <= 0) {
      add('CAD-RADIUS', 'error', `${entity.type} radius must be positive`, evidence(entity, { radius: entity.geometry.radius }))
    }
    if ((policy.forbiddenLayers || []).includes(entity.layer)) {
      add('CAD-LAYER-FORBIDDEN', 'error', `entity uses forbidden layer ${entity.layer}`, evidence(entity))
    }
    if ((policy.forbiddenEntityTypes || []).map(value => value.toUpperCase()).includes(entity.type)) {
      add('CAD-ENTITY-FORBIDDEN', 'error', `entity type ${entity.type} is forbidden`, evidence(entity))
    }
    if (Number.isFinite(policy.minTextHeight) && entity.geometry.kind === 'text' && Number.isFinite(entity.geometry.height) && entity.geometry.height < policy.minTextHeight) {
      add('CAD-TEXT-HEIGHT', 'warning', `text height ${entity.geometry.height} is below ${policy.minTextHeight}`, evidence(entity, { height: entity.geometry.height, minimum: policy.minTextHeight }))
    }
    if (entity.geometry.kind !== 'unsupported') {
      let geometry = entity.geometry
      if (geometry.kind === 'line') {
        const endpoints = [geometry.start, geometry.end].map(point => JSON.stringify(point)).sort()
        geometry = { ...geometry, start: JSON.parse(endpoints[0]), end: JSON.parse(endpoints[1]) }
      }
      const signature = `${entity.layer}:${JSON.stringify(geometry)}`
      const original = geometrySeen.get(signature)
      if (original) add('CAD-DUPLICATE-GEOMETRY', 'warning', `geometry duplicates entity ${original.handle ?? original.index}`, evidence(entity, { duplicateOf: original.handle ?? original.index }))
      else geometrySeen.set(signature, entity)
    }
  }

  const actualLayers = new Set(parsed.entities.map(entity => entity.layer))
  for (const layer of policy.requiredLayers || []) {
    if (!actualLayers.has(layer)) add('CAD-LAYER-REQUIRED', 'error', `required layer ${layer} is missing`, { entityIndex: null, layer })
  }
  if (Number.isFinite(policy.maxDrawingSpan) && parsed.bounds && Math.max(...parsed.bounds.span.slice(0, 2)) > policy.maxDrawingSpan) {
    add('CAD-DRAWING-SPAN', 'warning', `drawing span exceeds ${policy.maxDrawingSpan}`, { entityIndex: null, bounds: parsed.bounds, maximum: policy.maxDrawingSpan })
  }
  if (Number.isFinite(policy.requiredInsUnits) && parsed.insUnits?.code !== policy.requiredInsUnits) {
    add('CAD-UNITS', 'error', `INSUNITS must be ${policy.requiredInsUnits}, found ${parsed.insUnits?.code ?? 'missing'}`, { entityIndex: null, expected: policy.requiredInsUnits, actual: parsed.insUnits })
  }
  if (Number.isFinite(policy.maxEntities) && parsed.entities.length > policy.maxEntities) {
    add('CAD-ENTITY-LIMIT', 'error', `entity count ${parsed.entities.length} exceeds ${policy.maxEntities}`, { entityIndex: null, entityCount: parsed.entities.length, maximum: policy.maxEntities })
  }

  const rank = { error: 0, warning: 1, info: 2 }
  issues.sort((left, right) => rank[left.severity] - rank[right.severity] || (left.evidence?.lineStart ?? Infinity) - (right.evidence?.lineStart ?? Infinity) || left.ruleId.localeCompare(right.ruleId))
  const maxIssues = Number.isFinite(policy.maxIssues) ? Math.max(1, Math.floor(policy.maxIssues)) : 500
  const counts = { error: 0, warning: 0, info: 0 }
  for (const issue of issues) counts[issue.severity] += 1
  return {
    passed: counts.error === 0,
    counts,
    issueCount: issues.length,
    issues: issues.slice(0, maxIssues),
    issuesTruncated: issues.length > maxIssues,
    drawing: summarizeDxf(parsed, { maxEntityEvidence: 0 })
  }
}

export async function loadDxf({ workspaceRoot = process.cwd(), path, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const root = await realpath(workspaceRoot)
  const rel = assertRelativeDxf(path)
  const requested = resolve(root, rel)
  const actual = await realpath(requested)
  if (!isInside(root, actual)) throw new Error('DXF path resolves outside workspaceRoot')
  const fileStat = await stat(actual)
  if (!fileStat.isFile()) throw new Error('DXF path must resolve to a file')
  if (fileStat.size > maxBytes) throw new Error(`DXF exceeds maxBytes (${fileStat.size} > ${maxBytes})`)
  const buffer = await readFile(actual)
  if (buffer.includes(0)) throw new Error('binary DXF is not supported; export ASCII DXF')
  const parsed = parseDxf(buffer.toString('utf8'))
  return { root, relativePath: relative(root, actual).replaceAll('\\', '/'), bytes: buffer.length, sha256: sha256(buffer), parsed }
}

export async function inspectDxf(options) {
  const loaded = await loadDxf(options)
  return { source: loaded.relativePath, sha256: loaded.sha256, bytes: loaded.bytes, ...summarizeDxf(loaded.parsed, options) }
}

export async function reviewDxfFile(options) {
  const loaded = await loadDxf(options)
  const report = reviewDxf(loaded.parsed, options.policy || {})
  report.issues = report.issues.map(issue => ({
    ...issue,
    evidence: { sourcePath: loaded.relativePath, sourceSha256: loaded.sha256, ...issue.evidence }
  }))
  return { source: loaded.relativePath, sha256: loaded.sha256, bytes: loaded.bytes, ...report }
}
