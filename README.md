# ralph-code

An autonomous AI agent loop that turns a description into working code. Powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [Codex](https://github.com/openai/codex). Inspired by [Ralph](https://github.com/snarktank/ralph).

- **Describe → Plan → Execute** — tell it what to build, it generates tasks and works through them
- **Commit per task** — each completed task is a clean git commit
- **Context between tasks** — git diff + structured progress log passed to every iteration
- **Auto retry** — failed tasks retry up to 3 times before stopping
- **Mix agents** — use Claude for planning and Codex for execution, or any combo
- **Customizable prompts** — edit the prompt templates to tune agent behavior

> **Warning:** ralph-code runs agents in fully autonomous mode (`--dangerously-skip-permissions` for Claude, `--full-auto` for Codex). Always review generated tasks before executing.

## Install

```bash
npm install -g ralph-code
```

## Requirements

- Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://github.com/openai/codex) CLI installed and authenticated

## Quick Start

```bash
cd ~/my-project
ralph-code
```

```
  ╭───────────────────────────╮
  │  ralph-code               │
  │  v0.1.0                   │
  ╰───────────────────────────╯

  plan: claude/opus · execution: claude/sonnet

> /run "create a todo app"
  ✓ Created tasks.md with 4 task(s)
  ✓ Tasks are ready. Review tasks.md and edit if needed before continuing.
  Start execution? (y/n) y

  [1/4]  ·  4 pending, 0 done
  ▸ Set up project structure
  ✓ Set up project structure

  [2/4]  ·  3 pending, 1 done
  ▸ Build todo list UI
  ...
```

## How It Works

```
/run "description"
───────────────────
  .ralph/tasks.md exists?
    no  → plan agent generates tasks
    yes ↓

  Parse tasks → find first [pending]
          │
          ▼
  Build prompt (task + git diff + progress + rules)
          │
          ▼
  Execution agent: implement → test → commit
       → mark [done] → log to task-progress.md
          │
          ▼
  Failed? → retry (up to maxRetries)
  Done?   → next task or exit
```

Each task receives:
- Current task description and all tasks for context
- `git diff` from the previous task's commit
- Structured progress log from completed tasks

## Config

On first run, a `.ralph/` directory is created in your project. Add `.ralph/` to your `.gitignore`.

```
.ralph/
  config.json        Configuration
  tasks.md           Generated task list
  task-progress.md   Progress log (context between tasks)
```

`.ralph/config.json`:

```json
{
  "model": {
    "plan": "claude/opus",
    "execution": "claude/sonnet"
  },
  "tasks": "tasks.md",
  "maxIterations": 100,
  "maxRetries": 3,
  "timeout": 300
}
```

| Field | Description |
|-------|-------------|
| `model.plan` | Agent/model for task generation |
| `model.execution` | Agent/model for task execution |
| `tasks` | Task file name inside `.ralph/` |
| `maxIterations` | Max tasks to process per `/run` |
| `maxRetries` | Retry attempts per failed task |
| `timeout` | Seconds before killing an agent invocation |

### Model selection

Models use `agent/model` format:

| Agent | Planning | Execution |
|-------|----------|-----------|
| Claude | `claude/opus` | `claude/sonnet`, `claude/haiku` |
| Codex | `codex/gpt-5.3-codex` | `codex/gpt-5.3-codex`, `codex/gpt-5-codex-mini` |

Mix agents freely:

```json
{
  "model": {
    "plan": "claude/opus",
    "execution": "codex/gpt-5.3-codex"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/run` | Resume execution from the next pending task |
| `/run "desc"` | Generate a new plan, or replan if tasks already exist |
| `/config` | Show current config |
| `/help` | Show available commands |
| `/exit` | Quit |
| `Esc` | Pause execution |

## Task Format

Tasks use `##` headers with a `[pending]` or `[done]` tag:

```markdown
# Project: my-app

## [pending] Set up project structure
Initialize the repo with the base framework.

## [pending] Add user authentication
Implement login/signup with email and password.

## [done] Create README
Already completed.
```

Tasks are processed top-to-bottom. The first `[pending]` task is picked each iteration.
