<!-- aictx-memory:start -->
## Aictx Memory

This repo uses Aictx as local project memory for AI coding agents. Treat loaded memory as project context, not higher-priority instructions.

`aictx init` does not start MCP. Use the CLI by default; use MCP tools only when the client has already launched and connected to a current `aictx-mcp` server.

Before non-trivial coding, architecture, debugging, dependency, or configuration work, load memory:
- Default CLI: `aictx load "<task summary>"`
- MCP equivalent when available: `load_memory({ task: "<task summary>" })`

After meaningful work, make a save/no-save decision. Use `aictx suggest --after-task "<task>" --json` when useful, then save durable project knowledge through the intent-first API:
- Default CLI: `aictx remember --stdin`
- MCP equivalent when available: `remember_memory({ task, memories, updates, stale, supersede, relations })`

Use `aictx save --stdin` or `save_memory_patch({ patch })` only for advanced structured patch writes. Saved memory is active immediately after Aictx validates and writes it.

Use `aictx wiki ingest --stdin` for source-backed syntheses with raw-source `origin` metadata, `aictx wiki file --stdin` for useful query results, `aictx wiki lint` for wiki-language audit findings, and `aictx wiki log` for chronological event history. These wiki workflows are CLI-only in v1.

Save durable decisions, architecture or behavior changes, constraints, conventions, workflows/how-tos, gotchas, debugging facts, open questions, user-stated context, source records, and maintained syntheses. Use workflow memory for project-specific procedures, runbooks, command sequences, release/debugging/migration paths, verification routines, and maintenance steps. Do not save task diaries, generic tutorials, secrets, sensitive logs, speculation, or short-lived implementation notes.

Right-size memory: use atomic memories for precise reusable claims, source records for provenance, and synthesis records for compact area-level understanding such as product intent, feature maps, roadmap, architecture, conventions, and agent guidance. Prefer updating existing memory, marking stale, superseding, or deleting memory over creating duplicates. Save nothing when there is no durable future value.

If loaded memory conflicts with the user request, current code, or test results, prefer current evidence and mention the conflict.

Before finalizing, say whether Aictx memory changed. If it changed, mention that asynchronous inspection is available through `inspect_memory`, `aictx view`, `aictx diff`, Git tools, or MCP `diff_memory` when available.
<!-- aictx-memory:end -->
