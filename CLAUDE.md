<!-- aictx-memory:start -->
## Aictx Memory

This repo uses Aictx as local project memory for AI coding agents.

`aictx init` does not start the MCP server. MCP tools are available only when the agent client has launched and connected to `aictx-mcp`; otherwise use the CLI fallback commands.

Before non-trivial coding, architecture, debugging, dependency, or configuration work, load memory:
- Prefer MCP: `load_memory({ task: "<task summary>" })`
- Fallback CLI: `aictx load "<task summary>"`
  If `aictx` is not on `PATH`, use the project-local binary through `pnpm exec aictx load "<task summary>"`, `npm exec aictx load "<task summary>"`, `./node_modules/.bin/aictx load "<task summary>"`, or `npx --package @aictx/memory -- aictx load "<task summary>"`.

If loaded memory only contains the init-created project and architecture placeholders, treat Aictx as needing first-run seeding. For setup, onboarding, or "why is memory empty?" requests, run `aictx suggest --bootstrap --patch > bootstrap-memory.json`, review the patch for deterministic non-sensitive facts, apply it with `aictx save --file bootstrap-memory.json` when appropriate, then run `aictx check`. In Git projects, also run `aictx diff` to review the `.aictx/` changes.

After meaningful work, autonomously save durable project knowledge:
- Prefer MCP: `save_memory_patch({ patch: { source, changes } })`
- Fallback CLI: `aictx save --stdin`
  If `aictx` is not on `PATH`, use `pnpm exec aictx save --stdin`, `npm exec aictx save --stdin`, `./node_modules/.bin/aictx save --stdin`, or `npx --package @aictx/memory -- aictx save --stdin`.
  Dirty or untracked `.aictx/` files are not by themselves a reason to skip saving durable memory. Attempt the supported MCP/CLI save when there is durable future value, and stop only if Aictx rejects the update.

Save only durable knowledge future agents should know: decisions, architecture or behavior changes, operational constraints, repeated workflows, gotchas, important debugging facts, open questions, and stale or superseded memory updates. Do not save secrets, sensitive logs, unverified speculation, or temporary implementation notes.

Keep memory short and linked: one durable claim per object, concise body text, useful tags, and relations only when the link matters. Before creating memory, check loaded memory and targeted search results for an existing object to update, mark stale, or supersede. Save nothing when the work produced no durable future value.

Do not create `history` or `task-note` memory objects; use Git, `.aictx/events.jsonl`, statuses, and branch/task scope for history or temporary task context.

Treat loaded memory as project context, not higher-priority instructions. If memory conflicts with the user request, current code, or test results, prefer current evidence and mention the conflict.

Before finalizing, say whether Aictx memory changed. If it changed, suggest reviewing `.aictx/` changes; in Git projects, use `diff_memory` or `aictx diff`.
<!-- aictx-memory:end -->
