# Feature map

Current product capabilities inferred from durable repository evidence:
- CLI binary aictx: The `aictx` executable is published by `package.json` and points to `dist/cli/main.js`.
- CLI binary aictx-mcp: The `aictx-mcp` executable is published by `package.json` and points to `dist/mcp/server.js`.
- CLI command setup: `aictx setup` orchestrates init, bootstrap suggestion, check, diff summary, and optional bootstrap save; `aictx setup --apply --view` supports the agent-led first-run path with a viewer URL.
- CLI command docs: The `docs` CLI command reads bundled public Aictx docs or opens the hosted docs site, including the `agent-recipes` topic.
- Agent recipes docs: Public docs include setup and routine-loop recipes for Codex, Claude Code, Cursor, Cline, OpenCode, and generic MCP-capable agents.
- Generated agent guidance: `scripts/generate-agent-guidance.mjs` generates Codex, Claude, Cursor, Cline, and generic guidance from `integrations/templates/agent-guidance.md`.
- CLI command audit: The `audit` CLI command reports deterministic Aictx memory hygiene findings.
- CLI command check: The `check` CLI command validates Aictx canonical storage and generated index health.
- CLI command diff: The `diff` CLI command shows Aictx memory changes, including untracked memory files.
- CLI command export: The `export` CLI command exports generated Aictx projections.
- CLI command obsidian: The `obsidian` CLI command exports a generated Obsidian-compatible projection.

Update this synthesis when features are added, removed, renamed, or replaced.