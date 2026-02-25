import { spawn, execSync, type ChildProcess } from 'child_process'

export interface InvokeResult {
  code: number
  output: string
  stopped?: boolean
}

export interface AgentAdapter {
  name: string
  check(): boolean
  buildCommand(prompt: string, model: string): { bin: string; args: string[] }
}

// ---------------------------------------------------------------------------
// Claude adapter
// ---------------------------------------------------------------------------

const claude: AgentAdapter = {
  name: 'claude',
  check() {
    try {
      execSync('which claude', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  },
  buildCommand(prompt, model) {
    return {
      bin: 'claude',
      args: ['-p', '--dangerously-skip-permissions', '--model', model, prompt],
    }
  },
}

// ---------------------------------------------------------------------------
// Codex adapter
// ---------------------------------------------------------------------------

const codex: AgentAdapter = {
  name: 'codex',
  check() {
    try {
      execSync('which codex', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  },
  buildCommand(prompt, model) {
    return {
      bin: 'codex',
      args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '--model', model, prompt],
    }
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters: Record<string, AgentAdapter> = { claude, codex }

export function getAdapter(name: string): AgentAdapter {
  const adapter = adapters[name]
  if (!adapter) {
    throw new Error(`Unknown agent: ${name}. Available: ${Object.keys(adapters).join(', ')}`)
  }
  return adapter
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let activeChild: ChildProcess | null = null

export function stop(): boolean {
  if (activeChild) {
    activeChild.kill('SIGTERM')
    activeChild = null
    return true
  }
  return false
}

export function isRunning(): boolean {
  return activeChild !== null
}

export function invoke(
  adapter: AgentAdapter,
  prompt: string,
  opts: { model: string; timeout: number },
): Promise<InvokeResult> {
  const { bin, args } = adapter.buildCommand(prompt, opts.model)

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(bin, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    activeChild = child

    child.stdout.on('data', (data: Buffer) => (stdout += data))
    child.stderr.on('data', (data: Buffer) => (stderr += data))

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, opts.timeout * 1000)

    child.on('close', (code) => {
      clearTimeout(timer)
      activeChild = null
      if (timedOut) {
        resolve({ code: 1, output: `${adapter.name} timed out after ${opts.timeout}s` })
      } else if (code === null || (code !== 0 && !stdout && !stderr)) {
        resolve({ code: 1, output: '', stopped: true })
      } else {
        resolve({ code: code ?? 1, output: (stdout + stderr).trim() })
      }
    })

    child.on('error', (err: Error) => {
      clearTimeout(timer)
      activeChild = null
      resolve({ code: 1, output: `Failed to spawn ${adapter.name}: ${err.message}` })
    })
  })
}
