import * as fs from 'fs'
import * as path from 'path'

export const RALPH_DIR = '.ralph'
const CONFIG_FILE = 'config.json'

export interface ModelConfig {
  plan: string
  execution: string
}

export interface RalphConfig {
  model: ModelConfig
  tasks: string
  maxIterations: number
  maxRetries: number
  timeout: number
}

const DEFAULTS: RalphConfig = {
  model: {
    plan: 'claude/opus',
    execution: 'claude/sonnet',
  },
  tasks: 'tasks.md',
  maxIterations: 100,
  maxRetries: 3,
  timeout: 300,
}

export function ralphPath(filename: string): string {
  return path.resolve(RALPH_DIR, filename)
}

export function parseAgentModel(value: string): { agent: string; model: string } {
  const slash = value.indexOf('/')
  if (slash === -1) {
    return { agent: value, model: '' }
  }
  return { agent: value.slice(0, slash), model: value.slice(slash + 1) }
}

export function loadConfig(overrides: Partial<RalphConfig> = {}): RalphConfig {
  const configPath = ralphPath(CONFIG_FILE)
  let fileConfig: Partial<RalphConfig> = {}

  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      // ignore malformed config
    }
  }

  return {
    ...DEFAULTS,
    ...fileConfig,
    ...stripUndefined(overrides),
    model: {
      ...DEFAULTS.model,
      ...(fileConfig.model || {}),
      ...(overrides.model || {}),
    },
  }
}

export function initConfig(): string {
  const dir = path.resolve(RALPH_DIR)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const configPath = ralphPath(CONFIG_FILE)
  if (fs.existsSync(configPath)) {
    return configPath
  }

  fs.writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2) + '\n')
  return configPath
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value
  }
  return result
}
