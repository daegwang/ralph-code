import * as fs from 'fs'

export interface Task {
  title: string
  status: 'pending' | 'done'
  body: string
  lineNumber: number
}

const TASK_RE = /^##\s+\[(pending|done)\]\s+(.+)$/i

export function parseTasks(filePath: string): Task[] {
  const text = fs.readFileSync(filePath, 'utf-8')
  const lines = text.split('\n')
  const tasks: Task[] = []
  let current: Task | null = null

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_RE)
    if (match) {
      if (current) {
        current.body = current.body.trimEnd()
        tasks.push(current)
      }
      current = {
        title: match[2].trim(),
        status: match[1].toLowerCase() as 'pending' | 'done',
        body: '',
        lineNumber: i + 1,
      }
    } else if (current) {
      current.body += lines[i] + '\n'
    }
  }

  if (current) {
    current.body = current.body.trimEnd()
    tasks.push(current)
  }

  return tasks
}
