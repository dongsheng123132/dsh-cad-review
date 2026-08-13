# dsh-cad-review

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的证据优先 ASCII DXF 检查与确定性 CAD 规则审图插件。

它不从截图猜工程缺陷，而是读取 CAD 实体、计算源图 SHA-256，并把每条问题定位到实体 handle/index、图层、源行号范围和几何坐标。暂不支持的实体会明确成为证据缺口。

## 安装

```bash
dsh plugin --profile <name> add github:dongsheng123132/dsh-cad-review
```

配置工作区根目录和项目自己的策略：

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

输入必须是 `workspaceRoot` 下的相对 `.dxf` 路径；目录穿越、符号链接逃逸、二进制 DXF 和超大文件都会被拒绝。

## DSH 工具

- `dsh_cad_inspect_dxf`：输出源 SHA-256、单位、边界、图层、实体计数以及精确几何/源行号证据。
- `dsh_cad_review_dxf`：在同一证据上运行确定性策略；单次调用可用 `policyJson` 覆盖配置。

提取器理解 LINE、LWPOLYLINE、CIRCLE、ARC、TEXT、MTEXT、POINT、INSERT。其他实体仍会保留并标记为未结构化审查，不会被静默算成已检查。

当前检查包括：错误数字、零长度直线、非正半径、多段线闭合与声明顶点数、完全重复几何、必需/禁用图层、禁用实体类型、文字高度、单位、图幅跨度和实体数量。严重级别可按稳定 Rule ID 覆盖。

## CLI

```bash
dsh-cad-review inspect drawing.dxf
dsh-cad-review review drawing.dxf --policy examples/strict-mm-policy.json
```

存在 error 级问题时，`review` 退出码为 `2`。

## 证据边界

- v0.1 只读 ASCII DXF；二进制 DXF 和 DWG 会被拒绝，不会猜测。
- SHA-256 标识实际审查的字节，不证明图纸作者身份。
- 规则由项目所有；本包不冒充通用建筑、机械或电气规范。
- 报告通过只代表给定确定性策略未发现 error，不代表专业工程审批。
- 不支持的实体类型会让提取不完整，并在报告里显式保留。

## 验证

```bash
npm test
npm run check
npm run smoke:plugin
npm run smoke:cli
```

MIT
