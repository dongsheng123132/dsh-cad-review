# dsh-cad-review

Evidence-first ASCII DXF inspection and deterministic CAD rule review for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This plugin does not infer engineering defects from screenshots. It reads CAD entities, hashes the source drawing, and emits issues tied to entity handle/index, layer, source line range and geometric location. Unsupported entities remain visible as an evidence gap.

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
npm run smoke:cli
```

MIT
