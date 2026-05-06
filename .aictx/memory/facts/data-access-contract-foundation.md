# Data-access contract and read adapter wiring exist

T007 added the host-neutral data-access service foundation under `src/data-access/`. The default service exposes `load`, `search`, `inspect`, `diff`, and `applyPatch`, accepts `DataAccessProjectTarget` as either `cwd` or `project-root`, resolves that target to one project root and `.aictx` boundary, and returns current `AppResult` envelopes.

T008 routed the CLI and MCP read adapters for load, search, inspect, and diff through `dataAccessService`. CLI read commands now pass `{ target: { kind: "cwd", cwd } }` into the shared service before existing rendering, and MCP read tools do the same after resolving optional `project_root`. Existing CLI JSON output, MCP structured content, search ranking, context compilation, and save/write paths remain unchanged. T009 is still the write-path migration for structured patch saves.

Focused unit coverage lives in `test/unit/data-access/service.test.ts` for project targeting, nested cwd boundary resolution, and envelope preservation. Read parity coverage lives in `test/integration/mcp/read-tools.test.ts` and `test/integration/cli/read-only.test.ts`.
