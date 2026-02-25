#!/usr/bin/env node

import { parseArgs } from 'util'
import { startRepl } from './repl.js'
import { getAdapter } from './agent.js'
import { loadConfig, parseAgentModel } from './config.js'
import { bold, dim, cyan, red, green } from './colors.js'

async function main() {
  const rawArgs = process.argv.slice(2)

  const { values } = parseArgs({
    args: rawArgs,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
    allowPositionals: true,
  })

  if (values.version) {
    console.log('ralph-code v0.1.1')
    process.exit(0)
  }

  if (values.help) {
    printHelp()
    process.exit(0)
  }

  const config = loadConfig()

  // Verify both agent CLIs are installed
  const planAgent = parseAgentModel(config.model.plan).agent
  const execAgent = parseAgentModel(config.model.execution).agent

  for (const name of new Set([planAgent, execAgent])) {
    const adapter = getAdapter(name)
    if (!adapter.check()) {
      console.error(
        `${red('Error:')} '${name}' CLI not found. Install it first.`
      )
      process.exit(1)
    }
  }

  await startRepl(config)
}

function printHelp(): void {
  console.log(`
${bold('ralph-code')} v0.1.1

${dim('Autonomous AI agent loop powered by coding agents.')}
${dim('Config is loaded from .ralph/config.json (created on first run).')}

${bold('Usage:')}
  ${cyan('ralph-code')}         ${dim('Start interactive REPL')}

${bold('Options:')}
  ${cyan('-h, --help')}         ${dim('Show this help')}
  ${cyan('--version')}          ${dim('Show version')}

${bold('REPL commands:')}
  ${cyan('/run [desc]')}         ${dim('Run the agent loop (generates tasks if needed)')}
  ${cyan('/config')}            ${dim('Show current config')}
  ${cyan('/help')}              ${dim('Show this help')}
  ${cyan('/exit')}              ${dim('Quit')}
`)
}

process.on('SIGINT', () => {
  console.log('\nInterrupted.')
  process.exit(130)
})

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
