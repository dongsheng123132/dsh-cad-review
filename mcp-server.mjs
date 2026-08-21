#!/usr/bin/env node
import readline from 'node:readline'
import { inspectDxfText, reviewDxfText } from './lib/dxf.mjs'

const MAX_LINE_BYTES = 3 * 1024 * 1024
const tools = [
  {
    name: 'cad_dxf_inspect_inline',
    description: 'Inspect one explicit inline ASCII DXF in memory. Returns hashes, geometry, layers and source line evidence while redacting TEXT/MTEXT bodies.',
    inputSchema: { type: 'object', required: ['dxfText'], additionalProperties: false, properties: { dxfText: { type: 'string', maxLength: 2097152 } } }
  },
  {
    name: 'cad_dxf_review_inline',
    description: 'Apply a deterministic inline policy to one explicit ASCII DXF. No filesystem, network, subprocess, artifact write, or raw drawing text output.',
    inputSchema: { type: 'object', required: ['dxfText'], additionalProperties: false, properties: { dxfText: { type: 'string', maxLength: 2097152 }, policyJson: { type: 'string', maxLength: 65536 } } }
  }
]

function policy(value) {
  if (value === undefined) return {}
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('policyJson must encode an object')
  return parsed
}

function call(name, args) {
  if (name === 'cad_dxf_inspect_inline') return { ...inspectDxfText({ dxfText: args.dxfText }), disclosure: { proofOnly: true, filesystemAccess: false, networkAccess: false, rawTextIncluded: false } }
  if (name === 'cad_dxf_review_inline') return { ...reviewDxfText({ dxfText: args.dxfText, policy: policy(args.policyJson) }), disclosure: { proofOnly: true, filesystemAccess: false, networkAccess: false, rawTextIncluded: false } }
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: 'METHOD_NOT_FOUND' })
}

const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  if (!line.trim() || Buffer.byteLength(line) > MAX_LINE_BYTES) continue
  let request
  try { request = JSON.parse(line) } catch { continue }
  if (request.id === undefined) continue
  try {
    if (request.method === 'initialize') send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'dsh-cad-review', version: '0.2.0' } } })
    else if (request.method === 'tools/list') send({ jsonrpc: '2.0', id: request.id, result: { tools } })
    else if (request.method === 'tools/call') {
      const result = call(request.params?.name, request.params?.arguments ?? {})
      send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } })
    } else send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } })
  } catch (error) {
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message, data: { code: error.code ?? 'ERROR' } } })
  }
}
