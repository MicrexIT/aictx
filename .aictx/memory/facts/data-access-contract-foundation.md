# Data-access contract, adapter wiring, and profiles exist

The host-neutral data-access service under `src/data-access/` exposes `load`, `search`, `inspect`, `diff`, `remember`, and `applyPatch`. All adapters resolve a `cwd` or `project-root` target to one project root and `.aictx` boundary before reading or writing, and they return shared `AppResult` envelopes.

CLI and MCP read adapters for load, search, inspect, and diff route through `dataAccessService`. Routine memory creation now routes through `dataAccessService.remember`, which accepts intent-first agent memory input from CLI `aictx remember --stdin` or MCP `remember_memory`, compiles it deterministically into the structured patch format, and then uses the same save orchestration as advanced patch writes.

Advanced structured patch saves remain available through CLI `aictx save --stdin`, CLI `aictx save --file`, and MCP `save_memory_patch`; these call `dataAccessService.applyPatch`. The shared write path handles patch validation, secret checks, project locking, dirty touched-file backup, repair/quarantine, event append, and index update. MCP write tools share a per-project serialization queue.

The active local MCP profile maps `load_memory`, `search_memory`, `inspect_memory`, `remember_memory`, `save_memory_patch`, and `diff_memory` to data-access `load`, `search`, `inspect`, `remember`, `applyPatch`, and `diff`. The inactive future-generic profile still maps generic `search`/`fetch` only at the adapter boundary.

Focused coverage lives in data-access service/profile unit tests, CLI remember integration tests, MCP remember/save integration tests, and release/guidance contract tests.