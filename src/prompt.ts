import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { Task } from './tasks.js'

const PROMPTS_DIR = 'prompts'
const RUN_TEMPLATE = 'run.md'
const PLAN_TEMPLATE = 'plan.md'

function taskSummary(tasks: Task[]): string {
  return tasks
    .map((t, i) => {
      const marker = t.status === 'done' ? 'x' : ' '
      return `  ${i + 1}. [${marker}] ${t.title}`
    })
    .join('\n')
}

function loadTemplate(filename: string): string {
  // Check local project override first
  const localPath = path.resolve(PROMPTS_DIR, filename)
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath, 'utf-8')
  }
  // Fall back to package defaults
  const pkgPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'prompts', filename)
  if (fs.existsSync(pkgPath)) {
    return fs.readFileSync(pkgPath, 'utf-8')
  }
  throw new Error(`Prompt template not found: ${filename}`)
}

function getGitDiff(): string {
  try {
    const diff = execSync('git diff HEAD~1 --stat', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return diff || 'No previous commits.'
  } catch {
    return 'No git history available.'
  }
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

export function buildRunPrompt(
  task: Task,
  allTasks: Task[],
  tasksPath: string,
  progressPath: string,
): string {
  let progress = ''
  if (fs.existsSync(progressPath)) {
    progress = fs.readFileSync(progressPath, 'utf-8').trim()
  }

  const progressSection = progress
    ? `\n<progress-log>\n${progress}\n</progress-log>`
    : '\nNo progress logged yet.'

  const template = loadTemplate(RUN_TEMPLATE)
  return replaceVars(template, {
    task_title: task.title,
    task_body: task.body || '(no additional details)',
    task_summary: taskSummary(allTasks),
    git_diff: getGitDiff(),
    progress: progressSection,
    project_dir: process.cwd(),
    tasks_path: path.resolve(tasksPath),
    progress_path: path.resolve(progressPath),
  })
}

export function buildInitPrompt(tasksPath: string, description?: string): string {
  const absProjectDir = process.cwd()

  const descriptionSection = description
    ? `\n<description>\n${description}\n</description>\n`
    : ''

  const descriptionHint = description
    ? `\n   The user described the project as: "${description}". Use this to guide task generation.`
    : ''

  const template = loadTemplate(PLAN_TEMPLATE)
  return replaceVars(template, {
    project_dir: absProjectDir,
    project_name: path.basename(absProjectDir),
    description_section: descriptionSection,
    description_hint: descriptionHint,
    tasks_path: path.resolve(tasksPath),
  })
}
