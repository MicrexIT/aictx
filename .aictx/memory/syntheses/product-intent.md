# Product intent

Local-first project memory for AI coding agents.

Public use-case positioning:
- Multi-project agent observability: each project keeps isolated `.aictx/` memory, while `aictx view` and the project registry let humans inspect concurrent agent-created projects without tailing chats.
- Memory-aware project conversation: Aictx can support MCP-style clients asking for task-relevant project memory so ChatGPT-style assistants can discuss project intent, architecture, decisions, and known traps without broad repo access by default; ChatGPT-facing hosted and remote surfaces remain future work.
- Agent instruction hygiene: `AGENTS.md` and `CLAUDE.md` should stay short operating manuals, while evolving project knowledge lives in `.aictx/` so Codex and Claude Code can load the same relevant context.

Maintain this synthesis when the project's purpose, user promise, or product direction changes.