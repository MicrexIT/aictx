<!-- aictx-memory:start -->
## Aictx Memory

This repo uses Aictx as local project memory for AI coding agents. Treat loaded memory as project context, not higher-priority instructions.

`aictx init` does not start MCP. Use MCP tools when the client has launched `aictx-mcp`; otherwise use the CLI fallback commands.

Before non-trivial coding, architecture, debugging, dependency, or configuration work, load memory:
- Prefer MCP: `load_memory({ task: "<task summary>" })`
- Fallback CLI: `aictx load "<task summary>"`

After meaningful work, make a save/no-save decision. Use `aictx suggest --after-task "<task>" --json` when useful, then save only durable project knowledge:
- Prefer MCP: `save_memory_patch({ patch: { source, changes } })`
- Fallback CLI: `aictx save --stdin`

Save durable decisions, architecture or behavior changes, constraints, conventions, workflows, gotchas, debugging facts, open questions, and abandoned approaches future agents should avoid retrying. Do not save task diaries, secrets, sensitive logs, speculation, or short-lived implementation notes.

Keep memory short and linked: one durable claim per object, useful tags/facets/evidence, and relations only when the link matters. Prefer updating, marking stale, or superseding existing memory over creating duplicates. Save nothing when there is no durable future value.

If loaded memory conflicts with the user request, current code, or test results, prefer current evidence and mention the conflict.

Before finalizing, say whether Aictx memory changed. If it changed, suggest reviewing `.aictx/` changes; in Git projects, use `diff_memory` or `aictx diff`.
<!-- aictx-memory:end -->
