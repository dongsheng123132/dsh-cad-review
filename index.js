import { inspectDxf, reviewDxfFile } from './lib/dxf.mjs'

export const name = 'dsh-cad-review'
export const inject = ['tools']

function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function defineJsonTool({ name, description, parameters, execute }) {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { type: value.type, description: value.description }])),
      required: Object.entries(parameters).filter(([, value]) => value.required).map(([key]) => key),
      additionalProperties: false
    },
    output: { schema: {}, render: renderJson },
    execute(args) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('arguments must be an object')
      for (const [key, value] of Object.entries(parameters)) {
        if (value.required && (typeof args[key] !== value.type || args[key].length === 0)) throw new TypeError(`${key} is required`)
        if (args[key] !== undefined && typeof args[key] !== value.type) throw new TypeError(`${key} must be ${value.type}`)
      }
      for (const key of Object.keys(args)) if (!(key in parameters)) throw new TypeError(`unknown argument: ${key}`)
      return execute(args)
    }
  }
}

function policy(config, policyJson) {
  if (policyJson === undefined) return config.policy ?? {}
  return { ...(config.policy ?? {}), ...JSON.parse(policyJson) }
}

function fileOptions(config, path) {
  return {
    workspaceRoot: config.workspaceRoot ?? process.cwd(),
    path,
    maxBytes: config.maxBytes
  }
}

export function createDefinitions(_ctx, config = {}) {
  return [
    defineJsonTool({
      name: 'dsh_cad_inspect_dxf',
      description: 'Read one ASCII DXF under the configured workspace root and return source-hashed entity, layer, bounds and exact line/geometry evidence. Binary DXF, traversal, symlink escape and oversized files are refused.',
      parameters: {
        path: { type: 'string', required: true, description: 'DXF path relative to the configured workspaceRoot.' }
      },
      output: { schema: { type: 'json' }, render: renderJson },
      async execute(args) {
        return inspectDxf(fileOptions(config, args.path))
      }
    }),
    defineJsonTool({
      name: 'dsh_cad_review_dxf',
      description: 'Deterministically review an ASCII DXF. Every issue cites source SHA-256, entity handle/index, layer, source line range and geometric location; this is structured rule review, not screenshot interpretation.',
      parameters: {
        path: { type: 'string', required: true, description: 'DXF path relative to the configured workspaceRoot.' },
        policyJson: { type: 'string', description: 'Optional JSON object overriding configured project policy.' }
      },
      output: { schema: { type: 'json' }, render: renderJson },
      async execute(args) {
        return reviewDxfFile({ ...fileOptions(config, args.path), policy: policy(config, args.policyJson) })
      }
    })
  ]
}

export function apply(ctx, config = {}) {
  for (const definition of createDefinitions(ctx, config)) ctx.tools.register(definition)
}
