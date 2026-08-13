import { readFile } from 'node:fs/promises'

const required = ['package.json', '.codex-plugin/plugin.json', 'index.js', 'lib/dxf.mjs', 'cordis.patch.yml', 'examples/strict-mm-policy.json', 'README.md', 'README.zh-CN.md']
const files = Object.fromEntries(await Promise.all(required.map(async file => [file, await readFile(new URL(`../${file}`, import.meta.url), 'utf8')])))
const pkg = JSON.parse(files['package.json'])
const plugin = JSON.parse(files['.codex-plugin/plugin.json'])
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('missing DSH bundle patch')
if (plugin.name !== pkg.name) throw new Error('Codex plugin name must match package name')
if (pkg.scripts?.prepare || pkg.scripts?.postinstall) throw new Error('install lifecycle scripts are forbidden')
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
console.log(JSON.stringify({ ok: true, dshBundle: pkg.dsh.bundle.patch, codexManifest: true, tools: 2, evidenceFields: 4, inputGuards: 4 }))
