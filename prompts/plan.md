You are analyzing a project directory to generate a task list.

<project-dir>
{{project_dir}}
</project-dir>
{{description_section}}
<instructions>
1. Look at the project structure, README, existing code, config files, and any TODOs.{{description_hint}}
2. Generate a tasks.md file at `{{tasks_path}}` with actionable tasks.
3. Use this exact format for each task:

## [pending] Task title here
Description of what needs to be done.
Acceptance criteria or details if relevant.

4. Start the file with a `# Project: {{project_name}}` header.
5. Order tasks logically — setup first, then features, then polish.
6. Keep tasks focused and achievable in a single iteration.
7. If the project is empty/new, generate sensible scaffolding tasks.
8. Write ONLY the tasks.md file. Do not modify anything else.
</instructions>
