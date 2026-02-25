import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import { bold, dim, green, red, yellow, cyan, gray, teal, spinner } from './colors.js'
import { parseTasks } from './tasks.js'
import { buildRunPrompt, buildInitPrompt } from './prompt.js'
import { getAdapter, invoke, stop, isRunning, type AgentAdapter } from './agent.js'
import { initConfig, parseAgentModel, ralphPath, type RalphConfig } from './config.js'

let stopRequested = false

export async function startRepl(config: RalphConfig): Promise<void> {
  initConfig()

  const plan = parseAgentModel(config.model.plan)
  const exec = parseAgentModel(config.model.execution)
  const planAdapter = getAdapter(plan.agent)
  const execAdapter = getAdapter(exec.agent)

  const box = (s: string) => cyan(s)
  console.log('')
  console.log(`  ${box('╭───────────────────────────╮')}`)
  console.log(`  ${box('│')}  ${bold('ralph-code')}               ${box('│')}`)
  console.log(`  ${box('│')}  ${dim('v0.1.0')}                   ${box('│')}`)
  console.log(`  ${box('╰───────────────────────────╯')}`)
  console.log('')

  printOverview(config, planAdapter, execAdapter)
  printHelp()

  function promptHr(): string {
    const cols = process.stdout.columns || 80
    return dim('─'.repeat(cols))
  }

  function drawPrompt(): void {
    console.log(promptHr())
    console.log(bold('> '))
    console.log(promptHr())
    process.stdout.write('\x1b[2A\x1b[2C')
  }

  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const lineQueue: string[] = []
  let lineResolve: ((line: string | null) => void) | null = null

  process.stdin.on('keypress', (_ch: string, key: readline.Key) => {
    if (key && key.name === 'escape') {
      if (isRunning()) {
        stopRequested = true
        stop()
        console.log(`\n  ${yellow('⏸')} Stopping after current task...`)
      } else if (lineResolve) {
        const resolve = lineResolve
        lineResolve = null
        rl.write('', { ctrl: true, name: 'u' })
        resolve(null)
      }
    }
  })

  rl.on('line', (line) => {
    if (lineResolve) {
      const resolve = lineResolve
      lineResolve = null
      resolve(line)
    } else {
      lineQueue.push(line)
    }
  })

  rl.on('close', () => {
    if (lineResolve) {
      const resolve = lineResolve
      lineResolve = null
      resolve(null)
    }
  })

  const nextLine = (): Promise<string | null> => {
    if (lineQueue.length > 0) {
      return Promise.resolve(lineQueue.shift()!)
    }
    return new Promise(resolve => { lineResolve = resolve })
  }

  while (true) {
    drawPrompt()
    const input = await nextLine()
    process.stdout.write('\x1b[2A\x1b[0G\x1b[J')
    if (input === null) break
    const trimmed = input.trim()

    if (!trimmed) continue

    if (trimmed.startsWith('/')) {
      const handled = await handleCommand(trimmed, config, planAdapter, execAdapter, nextLine)
      if (handled === 'exit') {
        rl.close()
        process.exit(0)
      }
    } else {
      console.log(dim('  Use /help for available commands.'))
    }
  }

  process.exit(0)
}

async function handleCommand(
  input: string,
  config: RalphConfig,
  planAdapter: AgentAdapter,
  execAdapter: AgentAdapter,
  nextLine: () => Promise<string | null>,
): Promise<string | void> {
  const parts = input.slice(1).split(/\s+/)
  const cmd = parts[0].toLowerCase()

  switch (cmd) {
    case 'exit':
    case 'quit':
    case 'q':
      if (isRunning()) stop()
      console.log(dim('  Goodbye!'))
      return 'exit'

    case 'help':
    case 'h':
    case '?':
      printHelp()
      break

    case 'run': {
      const description = parts.slice(1).join(' ').trim()
      await handleRun(config, planAdapter, execAdapter, nextLine, description)
      break
    }

    case 'config':
      handleConfig(config)
      break

    default:
      console.log(red(`  Unknown command: ${cmd}.`) + dim(' Type /help for available commands.'))
  }
}

function printHelp(): void {
  console.log(`
  ${bold('Commands:')}
    ${cyan('/run [desc]')}  ${dim('Run the agent loop (generates tasks if needed)')}
    ${cyan('/config')}      ${dim('Show current config')}
    ${cyan('/help')}        ${dim('Show this help')}
    ${cyan('/exit')}        ${dim('Quit')}
`)
}

function printOverview(config: RalphConfig, planAdapter: AgentAdapter, execAdapter: AgentAdapter): void {
  const tasksPath = ralphPath(config.tasks)

  console.log(`  ${dim('plan:')} ${bold(config.model.plan)}  ${dim('·')} ${dim('execution:')} ${bold(config.model.execution)}`)
  console.log('')

  if (!fs.existsSync(tasksPath)) {
    console.log(`  ${gray('○')} ${dim('No')} ${dim(config.tasks)} ${dim('found')}`)
    console.log(`  ${dim('Run')} ${cyan('/run')} ${dim('to generate tasks and start.')}`)
    console.log('')
    return
  }

  const tasks = parseTasks(tasksPath)
  const pending = tasks.filter(t => t.status === 'pending')
  const done = tasks.filter(t => t.status === 'done')

  console.log(`  ${green('●')} ${bold(config.tasks)}  ${dim('·')} ${teal(`${done.length}/${tasks.length} done`)}`)

  if (pending.length > 0) {
    console.log(`    ${cyan('▸')} ${bold('Next:')} ${pending[0].title}`)
  } else {
    console.log(`    ${green('✓')} ${dim('All tasks complete')}`)
  }

  console.log('')
}

async function generateTasks(
  config: RalphConfig,
  planAdapter: AgentAdapter,
  nextLine: () => Promise<string | null>,
  description?: string,
): Promise<boolean> {
  const tasksPath = ralphPath(config.tasks)
  const plan = parseAgentModel(config.model.plan)

  if (!description) {
    console.log(`  ${gray('○')} No ${config.tasks} found. What are you building?`)
    process.stdout.write(`  ${dim('>')} `)
    const answer = await nextLine()
    if (!answer || !answer.trim()) {
      console.log(dim('  Cancelled.'))
      return false
    }
    description = answer.trim()
  }

  const prompt = buildInitPrompt(tasksPath, description)
  const spin = spinner(`${planAdapter.name} is analyzing your project...`)
  const result = await invoke(planAdapter, prompt, { model: plan.model, timeout: config.timeout })
  spin.stop('')

  if (result.stopped) {
    console.log(`  ${yellow('⏸')} Stopped.`)
    return false
  }

  if (fs.existsSync(tasksPath)) {
    const tasks = parseTasks(tasksPath)
    console.log(`  ${green('✓')} Created ${cyan(config.tasks)} with ${bold(String(tasks.length))} task(s):\n`)
    tasks.forEach((t, i) => console.log(`    ${dim(`${i + 1}.`)} ${t.title}`))
    console.log('')
    return true
  }

  console.log(`  ${red('✗')} Failed to generate tasks. Output:`)
  console.log(dim('  ' + result.output.slice(0, 300)))
  console.log('')
  return false
}

async function handleRun(
  config: RalphConfig,
  planAdapter: AgentAdapter,
  execAdapter: AgentAdapter,
  nextLine: () => Promise<string | null>,
  description?: string,
): Promise<void> {
  const tasksPath = ralphPath(config.tasks)
  const progressPath = ralphPath('task-progress.md')
  const exec = parseAgentModel(config.model.execution)
  stopRequested = false

  const needsGeneration = !fs.existsSync(tasksPath) || !!description

  if (needsGeneration) {
    const ok = await generateTasks(config, planAdapter, nextLine, description || undefined)
    if (!ok) return

    console.log(`\n  ${green('✓')} Tasks are ready. ${dim(`Review ${config.tasks} and edit if needed before continuing.`)}`)
    process.stdout.write(`  Start execution? ${dim('(y/n)')} `)
    const confirm = await nextLine()
    const answer = confirm?.trim().toLowerCase()
    if (answer !== 'y' && answer !== 'yes') {
      console.log(dim('  Skipped. Run /run to start execution later.'))
      return
    }
  }

  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    if (stopRequested) {
      console.log(`\n  ${yellow('⏸')} Paused. Run ${cyan('/run')} to continue.`)
      stopRequested = false
      return
    }

    const tasks = parseTasks(tasksPath)
    const pending = tasks.filter(t => t.status === 'pending')

    if (pending.length === 0) {
      console.log(`\n  ${green('✓')} All tasks are done!`)
      return
    }

    const task = pending[0]
    const done = tasks.length - pending.length

    console.log('')
    const total = Math.min(tasks.length, config.maxIterations)
    console.log(`  ${bold(`[${done + 1}/${total}]`)}  ${dim('·')}  ${pending.length} pending, ${done} done`)
    console.log(`  ${cyan('▸')} ${bold(task.title)}`)

    let succeeded = false

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      if (attempt > 1) {
        console.log(`  ${yellow('↻')} Retry ${attempt}/${config.maxRetries}`)
      }

      const prompt = buildRunPrompt(task, tasks, tasksPath, progressPath)
      console.log(dim('  Press Esc to pause'))
      const spin = spinner(`Working on: ${task.title}`)
      const result = await invoke(execAdapter, prompt, { model: exec.model, timeout: config.timeout })
      spin.stop('')

      if (result.stopped || stopRequested) {
        console.log(`\n  ${yellow('⏸')} Paused. Run ${cyan('/run')} to continue.`)
        stopRequested = false
        return
      }

      const lines = result.output.split('\n')
      const preview = lines.slice(0, 20).join('\n')
      if (preview) {
        console.log(dim('  ' + preview.split('\n').join('\n  ')))
        if (lines.length > 20) {
          console.log(dim(`  ... (${lines.length - 20} more lines)`))
        }
      }

      const tasksAfter = parseTasks(tasksPath)
      const updated = tasksAfter.find(t => t.title === task.title)

      if (updated && updated.status === 'done') {
        console.log(`  ${green('✓')} ${task.title}`)
        succeeded = true
        break
      }

      if (result.code !== 0) {
        console.log(`  ${red('✗')} ${execAdapter.name} returned an error`)
      } else {
        console.log(`  ${yellow('○')} Still pending: ${task.title}`)
      }
    }

    if (!succeeded) {
      console.log(`  ${red('✗')} Failed after ${config.maxRetries} attempt(s) — stopping.`)
      return
    }

    const remaining = parseTasks(tasksPath).filter(t => t.status === 'pending')
    if (remaining.length === 0) {
      console.log(`\n  ${green('✓')} All tasks are done!`)
      return
    }
  }

  console.log(`\n  ${yellow('⚡')} Reached max iterations (${config.maxIterations}).`)
}

function handleConfig(config: RalphConfig): void {
  const configPath = ralphPath('config.json')

  console.log(`\n  ${bold('●')} ${bold('Config')}  ${dim(configPath)}\n`)
  console.log(`    ${cyan('model.plan')}       ${config.model.plan}`)
  console.log(`    ${cyan('model.execution')}  ${config.model.execution}`)
  console.log(`    ${cyan('tasks')}            ${config.tasks}`)
  console.log(`    ${cyan('maxIterations')}    ${config.maxIterations}`)
  console.log(`    ${cyan('maxRetries')}       ${config.maxRetries}`)
  console.log(`    ${cyan('timeout')}          ${config.timeout}s`)
  console.log(`\n  ${dim('Edit .ralph/config.json to change defaults.')}`)
  console.log('')
}
