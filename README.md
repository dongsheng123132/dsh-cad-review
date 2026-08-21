# dsh-cad-review

[![CI](https://github.com/dongsheng123132/dsh-cad-review/actions/workflows/check.yml/badge.svg)](https://github.com/dongsheng123132/dsh-cad-review/actions/workflows/check.yml)
[![MIT license](https://img.shields.io/github/license/dongsheng123132/dsh-cad-review)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Awesome DSH Plugins](https://img.shields.io/badge/Awesome_DSH-verified_lab-0969da)](https://github.com/dongsheng123132/awesome-dsh-plugins#2origin-plugin-lab)

Evidence-first ASCII DXF inspection and deterministic CAD rule review for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This plugin does not infer engineering defects from screenshots. It reads CAD entities, hashes the source drawing, and emits issues tied to entity handle/index, layer, source line range and geometric location. Unsupported entities remain visible as an evidence gap.

Version 0.2.0 is host-neutral and stock-Cordis-loader safe: it imports no private ToolRuntime helper and exposes no default export, preserving the module-level `inject = ['tools']` contract. `TEXT`/`MTEXT` bodies and malformed numeric tokens are represented only by SHA-256 plus length, so evidence output does not reproduce drawing prose.

This scope complements broader robotics suites such as [dsh-robotic-harness](https://github.com/dingkaihu63/dsh-robotic-harness): that project inventories robot assets and validates URDF/MJCF/SDF workflows, while this plugin remains a small deterministic ASCII-DXF entity/rule evidence layer.

## Install

```bash
dsh plugin --profile <name> add github:dongsheng123132/dsh-cad-review
```

Configure a workspace root and project-owned policy:

```yaml
- id: dsh-cad-review
  name: dsh-cad-review
  config:
    workspaceRoot: C:/absolute/project/path
    maxBytes: 20971520
    policy:
      requiredLayers: ["WALL"]
      forbiddenLayers: ["DEFPOINTS"]
      forbiddenEntityTypes: ["3DSOLID"]
      requireClosedPolylines: true
      minTextHeight: 2.5
      maxDrawingSpan: 1000
      requiredInsUnits: 4
      maxEntities: 100000
      maxIssues: 500
```

Paths must be `.dxf` files relative to `workspaceRoot`. Traversal, symlink escape, binary DXF and oversized input are refused.

## DSH tools

- `dsh_cad_inspect_dxf` — source SHA-256, units, bounds, layers, entity counts and exact entity geometry/line evidence.
- `dsh_cad_review_dxf` — the same evidence plus a deterministic policy report. A per-call `policyJson` can override configured policy.

The extractor understands LINE, LWPOLYLINE, CIRCLE, ARC, TEXT, MTEXT, POINT and INSERT geometry. Other types are retained and reported as structurally unsupported rather than silently treated as reviewed.

## MCP proof surface

The formal `.mcp.json` declaration exposes `cad_dxf_inspect_inline` and `cad_dxf_review_inline`. They accept an explicit bounded ASCII DXF string, share the same parser and rule core, and return redacted structured evidence entirely in memory. The MCP server cannot read files, access the network, execute drawing content, start subprocesses, or write artifacts.

Checks cover malformed numbers, zero-length lines, non-positive radii, polyline closure and declared vertex count, exact duplicate geometry, required/forbidden layers, forbidden entity types, text height, units, drawing span and entity limits. Severity overrides use stable rule IDs.

## CLI

```bash
dsh-cad-review inspect drawing.dxf
dsh-cad-review review drawing.dxf --policy examples/strict-mm-policy.json
```

`review` exits `2` when error-severity issues exist.

## Evidence boundary

- v0.1 reads ASCII DXF only. Binary DXF and DWG are refused, not guessed.
- A source SHA-256 identifies the exact reviewed bytes; it does not prove authorship.
- Rules are project-owned. This package does not claim a universal building, mechanical or electrical code.
- A passing report means the supplied deterministic policy found no error; it is not professional engineering approval.
- Unsupported entity types make extraction incomplete and remain explicit in the report.

## Verify

```bash
npm test
npm run check
npm run smoke:plugin
npm run smoke:mcp
npm run smoke:cli
DSH_CHECKOUT=/path/to/deepseek-harness npm run smoke:dsh
```

MIT
