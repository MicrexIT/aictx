# Aictx Agent Planning Handoffs

Each handoff is intended for a planning agent first. The agent should produce a concrete implementation plan, risk notes, and test strategy before code is changed.

## Template

```text
Plan roadmap task <TASK_ID>: <TASK_TITLE>.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- <task-specific files>

Write scope:
- <files/modules owned by the task>

Do not modify:
- <explicit exclusions>

Acceptance:
- <copy task acceptance criteria>

Run:
- pnpm typecheck
- <task-specific tests>
```

## T001: Rebaseline Specs, PRD, Capability Map, and Guardrail Tests

```text
Plan roadmap task T001: Rebaseline Specs, PRD, Capability Map, and Guardrail Tests.

Read these files first:
- implementation-roadmap.md
- prd.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md
- aictx-data-access-spec.md
- test/unit/agent-capability-map.test.ts
- test/unit/agent-guidance/content.test.ts

Write scope:
- prd.md and specs/prd.md
- mcp-and-cli-api-spec.md and specs/mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md and specs/runtime-and-project-architecture-spec.md
- implementation-roadmap.md and specs/implementation-roadmap.md
- aictx-data-access-spec.md and specs/aictx-data-access-spec.md
- agent-planning-handoffs.md
- capability map and guidance guardrail tests

Do not modify:
- Runtime implementation except test fixtures needed to lock the new contract.
- Remote MCP, OAuth, hosted sync, billing, tenancy, embeddings, or ChatGPT App SDK UI docs beyond explicit deferred-language guardrails.

Acceptance:
- Mirrored specs are synchronized.
- Capability maps list object inspection as a shared `inspect_memory` and `aictx inspect` capability.
- Object inspection is absent from CLI-only capability lists.
- Legacy roadmap references and deprecated four-tool wording are removed.
- Guardrail tests expect the five local MCP tools.

Run:
- pnpm vitest run test/unit/agent-capability-map.test.ts
- pnpm vitest run test/unit/agent-guidance/content.test.ts
- cmp prd.md specs/prd.md
- cmp mcp-and-cli-api-spec.md specs/mcp-and-cli-api-spec.md
- cmp implementation-roadmap.md specs/implementation-roadmap.md
- cmp runtime-and-project-architecture-spec.md specs/runtime-and-project-architecture-spec.md
- cmp aictx-data-access-spec.md specs/aictx-data-access-spec.md
- rg -n 'MCP \+ CLI capabilities: load, search, save, diff\.|CLI-only capabilities in v1:.*\binspect\b|MCP load/search/save flows|No network calls in init, load, search, save, diff, check, rebuild, history, restore, or MCP tools|exactly `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`' prd.md specs/prd.md mcp-and-cli-api-spec.md specs/mcp-and-cli-api-spec.md runtime-and-project-architecture-spec.md specs/runtime-and-project-architecture-spec.md aictx-data-access-spec.md specs/aictx-data-access-spec.md implementation-roadmap.md specs/implementation-roadmap.md README.md docs/src/content/docs/agent-integration.md docs/src/content/docs/mcp.md docs/src/content/docs/reference.md integrations/templates/agent-guidance.md
```

## T002: Add `inspect_memory` to Local MCP

```text
Plan roadmap task T002: Add `inspect_memory` to Local MCP.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md
- src/app/operations.ts
- src/cli/commands/inspect.ts
- src/mcp/server.ts
- src/mcp/tools/
- test/integration/cli/read-only.test.ts
- test/integration/mcp/read-tools.test.ts

Write scope:
- src/mcp/server.ts
- src/mcp/tools/inspect-memory.ts
- MCP read/registration/workflow tests

Do not modify:
- CLI inspect output shape.
- Structured patch write behavior.
- Low-level storage read semantics.
- Any MCP create/update/delete object or relation tools.

Acceptance:
- MCP registers `inspect_memory` as a read-only tool.
- Output matches `aictx inspect --json`.
- Missing IDs return the shared `AICtxObjectNotFound` envelope.
- Global `project_root` targeting works.
- No create/update/delete object or relation tools are added.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/mcp/registration-cleanup.test.ts
- pnpm vitest run test/integration/mcp/read-tools.test.ts
```

## T003: Harden Local MCP Startup and Targeting

```text
Plan roadmap task T003: Harden Local MCP Startup and Targeting.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md
- docs/src/content/docs/mcp.md
- src/mcp/server.ts
- src/mcp/context.ts
- test/integration/mcp/server.test.ts

Write scope:
- src/mcp/server.ts
- src/mcp/context.ts
- MCP startup/client docs
- MCP server tests

Do not modify:
- CLI command behavior.
- Storage project-root resolution outside MCP targeting needs.
- Remote or network server behavior.

Acceptance:
- MCP startup writes no non-protocol stdout.
- Startup failures produce useful stderr diagnostics.
- `project_root` is documented as project selection, not arbitrary filesystem access.
- Client launch examples cover global, package-manager, and local-binary forms.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/server.test.ts
```

## T004: Align MCP Schemas, Errors, Metadata, and Envelopes

```text
Plan roadmap task T004: Align MCP Schemas, Errors, Metadata, and Envelopes.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- src/mcp/tools/
- src/cli/render.ts
- src/app/operations.ts
- test/integration/mcp/

Write scope:
- src/mcp/tools/
- shared MCP result helpers if introduced
- MCP read/save/error tests

Do not modify:
- CLI JSON envelope contracts except to fix confirmed divergence.
- Structured patch schema semantics.
- Storage validation rules.

Acceptance:
- Tool inputs reject unknown fields.
- Error envelopes match CLI JSON codes, messages, details, warnings, and meta where applicable.
- Result envelopes include structured content matching the text JSON payload.
- Tool annotations correctly mark read and write behavior.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/read-tools.test.ts
- pnpm vitest run test/integration/mcp/save-tool.test.ts
```

## T005: Add Full Local MCP Workflow Tests

```text
Plan roadmap task T005: Add Full Local MCP Workflow Tests.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- test/integration/e2e/mcp-workflow.test.ts
- test/integration/mcp/server.test.ts
- test/integration/security/security-regressions.test.ts

Write scope:
- MCP e2e workflow tests
- MCP server/security guardrail tests
- Fixtures needed by those tests

Do not modify:
- Product docs unless tests expose a contract drift.
- Runtime behavior except small fixes required for the tests to pass.

Acceptance:
- Workflow tests call all five MCP tools.
- Tests prove global MCP can target multiple initialized projects via `project_root`.
- Tests prove MCP does not expose CLI-only, shell, filesystem, or low-level graph mutation tools.
- Tests prove stderr/stdout safety for client launch.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/e2e/mcp-workflow.test.ts
- pnpm vitest run test/integration/mcp/server.test.ts
- pnpm vitest run test/integration/security/security-regressions.test.ts
```

## T006: Update MCP Docs, README, Agent Guidance, Install Examples, and Release Checks

```text
Plan roadmap task T006: Update MCP Docs, README, Agent Guidance, Install Examples, and Release Checks.

Read these files first:
- implementation-roadmap.md
- README.md
- docs/src/content/docs/mcp.md
- docs/src/content/docs/agent-integration.md
- docs/src/content/docs/reference.md
- integrations/templates/agent-guidance.md
- scripts/generate-agent-guidance.mjs
- test/integration/release/packaging.test.ts

Write scope:
- README.md
- public docs under docs/src/content/docs/
- integrations/templates/agent-guidance.md
- generated guidance files
- release/package guidance checks

Do not modify:
- MCP runtime implementation.
- Storage or CLI behavior.
- Unrelated public site pages.

Acceptance:
- README, public docs, and generated guidance list the five MCP tools.
- Guidance says CLI is default and MCP is available when the client already exposes Aictx tools.
- Docs keep setup, maintenance, recovery, export, registry, viewer, docs, suggest, audit, stale, and graph outside local MCP.
- Release/package checks validate updated guidance.

Run:
- pnpm build:guidance
- pnpm vitest run test/unit/agent-guidance/content.test.ts
- pnpm vitest run test/unit/agent-guidance/generated-files.test.ts
- pnpm vitest run test/integration/release/packaging.test.ts
```

## T007: Specify and Implement the Host-Neutral Data-Access Service Contract

```text
Plan roadmap task T007: Specify and Implement the Host-Neutral Data-Access Service Contract.

Read these files first:
- implementation-roadmap.md
- aictx-data-access-spec.md
- runtime-and-project-architecture-spec.md
- src/app/operations.ts
- src/mcp/context.ts
- src/cli/commands/load.ts
- src/cli/commands/save.ts

Write scope:
- src/data-access/
- exported data-access service types
- focused unit tests for project targeting and envelope preservation

Do not modify:
- CLI/MCP adapter behavior beyond wiring to compile.
- Public command names or local MCP tool names.
- Remote/cloud adapter implementation.

Acceptance:
- Contract matches `aictx-data-access-spec.md`.
- The service resolves one project root and one `.aictx/` boundary per operation.
- The service uses current `AppResult` envelopes and metadata.
- No adapter-specific behavior leaks into the core contract.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/data-access/
```

## T008: Move Shared Read Behavior Behind Data Access

```text
Plan roadmap task T008: Move Shared Read Behavior Behind Data Access.

Read these files first:
- implementation-roadmap.md
- aictx-data-access-spec.md
- src/data-access/
- src/app/operations.ts
- src/cli/commands/load.ts
- src/cli/commands/search.ts
- src/cli/commands/inspect.ts
- src/cli/commands/diff.ts
- src/mcp/tools/load-memory.ts
- src/mcp/tools/search-memory.ts
- src/mcp/tools/inspect-memory.ts
- src/mcp/tools/diff-memory.ts

Write scope:
- data-access read functions
- CLI/MCP read adapter wiring
- read parity tests

Do not modify:
- Save/write path.
- CLI output rendering.
- Search ranking or context compiler internals unless required to preserve behavior.

Acceptance:
- CLI and MCP read adapters use the same data-access read functions.
- Existing CLI JSON output remains stable.
- Existing MCP structured content remains stable.
- Read behavior remains safe outside Git where supported.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/read-tools.test.ts
- pnpm vitest run test/integration/cli/read-only.test.ts
```

## T009: Move Structured Patch Writes Behind Data Access

```text
Plan roadmap task T009: Move Structured Patch Writes Behind Data Access.

Read these files first:
- implementation-roadmap.md
- aictx-data-access-spec.md
- src/app/operations.ts
- src/storage/write.ts
- src/cli/commands/save.ts
- src/mcp/tools/save-memory-patch.ts
- test/integration/mcp/save-tool.test.ts

Write scope:
- data-access write function
- CLI save adapter wiring
- MCP save adapter wiring
- write parity tests

Do not modify:
- Structured patch operation names.
- MCP write tool set.
- Dirty backup, recovery, lock, event, or index semantics except to preserve parity.

Acceptance:
- `aictx save --stdin`, `aictx save --file`, and `save_memory_patch` share the same structured patch write path.
- Dirty touched-file backup, repair/quarantine, locking, event append, and index update behavior remains unchanged.
- MCP still exposes no write primitive except `save_memory_patch`.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/save-tool.test.ts
- pnpm vitest run test/integration/cli/save.test.ts
```

## T010: Add Host Adapter Profiles

```text
Plan roadmap task T010: Add Host Adapter Profiles.

Read these files first:
- implementation-roadmap.md
- aictx-data-access-spec.md
- mcp-and-cli-api-spec.md
- src/data-access/
- src/mcp/server.ts

Write scope:
- adapter profile types/configuration
- docs/spec notes for inactive future profiles
- unit tests for profile mapping

Do not modify:
- Local MCP tool names.
- Active local MCP registration behavior.
- Any real remote/cloud host implementation.

Acceptance:
- Local MCP profile preserves the five Aictx-specific tool names.
- Future generic `search` maps to data-access search.
- Future generic `fetch` maps to data-access inspect.
- Future profile code or docs remain inactive unless explicitly selected.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/data-access/
- pnpm vitest run test/unit/mcp/registration-cleanup.test.ts
```

## T011: Add Shared CLI/MCP Behavior Tests

```text
Plan roadmap task T011: Add Shared CLI/MCP Behavior Tests.

Read these files first:
- implementation-roadmap.md
- aictx-data-access-spec.md
- test/integration/mcp/read-tools.test.ts
- test/integration/mcp/save-tool.test.ts
- test/integration/e2e/mcp-workflow.test.ts

Write scope:
- CLI/MCP parity tests
- fixtures shared by parity tests

Do not modify:
- Runtime behavior unless the tests expose true divergence.
- Public contracts unless existing docs are wrong.

Acceptance:
- Tests compare CLI and MCP envelopes for load, search, inspect, diff, and save.
- Tests include global project targeting and non-Git behavior.
- Tests fail if CLI/MCP behavior forks for shared operations.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/read-tools.test.ts
- pnpm vitest run test/integration/mcp/save-tool.test.ts
- pnpm vitest run test/integration/e2e/mcp-workflow.test.ts
```

## T012: Update Docs and Guidance with Local-Now/Cloud-Later Story

```text
Plan roadmap task T012: Update Docs and Guidance with Local-Now/Cloud-Later Story.

Read these files first:
- implementation-roadmap.md
- prd.md
- mcp-and-cli-api-spec.md
- aictx-data-access-spec.md
- README.md
- docs/src/content/docs/
- integrations/templates/agent-guidance.md

Write scope:
- product/spec docs
- README and public docs
- generated agent guidance template and outputs
- docs/guidance tests

Do not modify:
- Runtime implementation.
- Data-access implementation.
- Remote/cloud feature code.

Acceptance:
- Docs explain that local MCP is the near-term integration path.
- Docs reserve remote/cloud/ChatGPT App SDK work as future.
- Docs describe ChatGPT-compatible `search`/`fetch` as a future adapter mapping, not local MCP tool names.
- Agent guidance remains concise and actionable.

Run:
- pnpm build:guidance
- pnpm vitest run test/unit/agent-capability-map.test.ts
- pnpm vitest run test/unit/agent-guidance/content.test.ts
- pnpm vitest run test/unit/agent-guidance/generated-files.test.ts
```
