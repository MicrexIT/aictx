# Agent guidance

Load Aictx memory before non-trivial coding, architecture, debugging, dependency, or configuration work. Prefer the CLI by default; use MCP only when the client has already launched a current `aictx-mcp` server.

Use `aictx remember --stdin` for normal durable memory writes. Use `aictx save --stdin` or `save_memory_patch({ patch })` only for advanced structured patch writes. Use `aictx wiki ingest --stdin` when filing source-backed synthesis with raw-source `origin` metadata, `aictx wiki file --stdin` for useful query results, `aictx wiki lint` for wiki-language audit findings, and `aictx wiki log` for event history. Wiki workflows remain CLI-only in v1.

Verification workflows:
- `pnpm run typecheck`: TypeScript plus Svelte validation for the viewer.
- `pnpm exec vitest run <targeted suites>`: focused regression coverage for changed areas.
- `pnpm run test:local`: package/release verification plus typecheck.
- `pnpm run build`: regenerated guidance/version/code/schemas/viewer bundle.

Update this synthesis when agent instructions, CLI/MCP boundaries, wiki workflows, or verification commands change.
