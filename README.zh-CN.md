# dsh-cad-review

[![CI](https://github.com/dongsheng123132/dsh-cad-review/actions/workflows/check.yml/badge.svg)](https://github.com/dongsheng123132/dsh-cad-review/actions/workflows/check.yml)
[![MIT 许可证](https://img.shields.io/github/license/dongsheng123132/dsh-cad-review)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Awesome DSH Plugins](https://img.shields.io/badge/Awesome_DSH-%E5%B7%B2%E9%AA%8C%E8%AF%81%E5%AE%9E%E9%AA%8C-0969da)](https://github.com/dongsheng123132/awesome-dsh-plugins/blob/main/README.zh-CN.md#2origin-%E6%8F%92%E4%BB%B6%E5%AE%9E%E9%AA%8C%E5%AE%A4)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的证据优先 ASCII DXF 检查与确定性 CAD 规则审图插件。

它不从截图猜工程缺陷，而是读取 CAD 实体、计算源图 SHA-256，并把每条问题定位到实体 handle/index、图层、源行号范围和几何坐标。暂不支持的实体会明确成为证据缺口。

v0.2.0 的入口已经宿主中立并兼容官方 Cordis Loader：不导入 ToolRuntime 私有辅助包，也不暴露默认导出，从而保留模块级 `inject = ['tools']`。`TEXT/MTEXT` 正文和非法数字 token 只输出 SHA-256 与长度，证据不会复制图纸业务文字。

本插件与更宽的 [dsh-robotic-harness](https://github.com/dingkaihu63/dsh-robotic-harness) 互补：后者覆盖机器人资产清单及 URDF/MJCF/SDF 流程，本插件只做小而确定的 ASCII DXF 实体/规则证据层。

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

## MCP 证明表面

正式 `.mcp.json` 声明提供 `cad_dxf_inspect_inline` 与 `cad_dxf_review_inline`。它们接收显式、有大小上限的 ASCII DXF 字符串，共用同一解析与规则核心，纯内存返回脱敏结构证据。MCP 不能读文件、联网、执行图纸内容、启动子进程或写产物。

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
npm run smoke:mcp
npm run smoke:cli
DSH_CHECKOUT=/path/to/deepseek-harness npm run smoke:dsh
```

MIT
