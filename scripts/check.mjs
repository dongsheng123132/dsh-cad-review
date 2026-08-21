import { readFile } from 'node:fs/promises'

const required = ['package.json', '.codex-plugin/plugin.json', '.mcp.json', 'index.js', 'lib/dxf.mjs', 'mcp-server.mjs', 'SECURITY.md', 'cordis.patch.yml', 'examples/strict-mm-policy.json', 'README.md', 'README.zh-CN.md', 'test/dsh-runtime-smoke.mjs', 'test/mcp-smoke.mjs', 'test/stock-web-loader-smoke.mjs']
const files = Object.fromEntries(await Promise.all(required.map(async file => [file, await readFile(new URL(`../${file}`, import.meta.url), 'utf8')])))
const pkg = JSON.parse(files['package.json'])
const plugin = JSON.parse(files['.codex-plugin/plugin.json'])
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('missing DSH bundle patch')
if (plugin.name !== pkg.name || plugin.version !== pkg.version) throw new Error('Codex plugin identity must match package identity')
if (plugin.mcpServers !== './.mcp.json') throw new Error('formal MCP declaration is required')
if (pkg.scripts?.prepare || pkg.scripts?.postinstall) throw new Error('install lifecycle scripts are forbidden')
if (pkg.peerDependencies?.['@deepseek-ai/dsh-tools'] || pkg.devDependencies?.['@deepseek-ai/dsh-tools']) throw new Error('host-private dsh-tools dependency is forbidden')
if (/from ['"]@deepseek-ai\/dsh-tools/.test(files['index.js']) || /export default/.test(files['index.js'])) throw new Error('entry must be host-neutral and namespace-loadable')
if (!files['cordis.patch.yml'].includes('name: dsh-cad-review')) throw new Error('bundle does not mount dsh-cad-review')
for (const tool of ['dsh_cad_inspect_dxf', 'dsh_cad_review_dxf']) {
  if (!files['index.js'].includes(`name: '${tool}'`)) throw new Error(`missing tool ${tool}`)
}
for (const evidence of ['sourceSha256', 'handle', 'lineStart', 'location']) {
  if (!files['lib/dxf.mjs'].includes(evidence)) throw new Error(`finding evidence field missing: ${evidence}`)
}
for (const guard of ['must not escape', 'resolves outside', 'binary DXF', 'exceeds maxBytes']) {
  if (!files['lib/dxf.mjs'].includes(guard)) throw new Error(`input guard missing: ${guard}`)
}
for (const privacy of ['textSha256', 'textLength', 'valueSha256', 'valueLength']) {
  if (!files['lib/dxf.mjs'].includes(privacy)) throw new Error(`privacy evidence field missing: ${privacy}`)
}
console.log(JSON.stringify({ ok: true, requiredFiles: required.length, dshBundle: pkg.dsh.bundle.patch, codexManifest: true, hostNeutral: true, mcpDeclared: true, tools: 2, evidenceFields: 4, privacyFields: 4, inputGuards: 4 }))
