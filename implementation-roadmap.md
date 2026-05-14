# Aictx Implementation Roadmap

## 1. Purpose

This roadmap splits the next Aictx work into small, ordered, testable implementation tasks focused on local MCP excellence and a shared host-neutral data-access layer.

This roadmap depends on:

* `prd.md`
* `mcp-and-cli-api-spec.md`
* `aictx-data-access-spec.md`
* `runtime-and-project-architecture-spec.md`
* `storage-format-spec.md`
* `indexing-and-context-compiler-spec.md`
* `schemas-and-validation-spec.md`
* `local-viewer-spec.md`

## 2. Roadmap Principles

Implementation must preserve these invariants:

* Aictx is local-first and does not require a cloud account, hosted service, embeddings, API keys, telemetry, or network access for core work.
* Canonical memory lives in `.aictx/`; generated indexes, exports, and viewers are rebuildable.
* CLI remains the default routine agent path.
* Local MCP is a supported generic local-agent interface for harnesses that can launch `aictx-mcp`.
* MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`, `remember_memory`, `save_memory_patch`, and `diff_memory`.
* `remember_memory` is the routine MCP write primitive; `save_memory_patch` remains the advanced structured patch primitive.
* CLI and MCP behavior must converge through shared application/data-access services.
* Future ChatGPT-compatible `search`/`fetch` naming is an adapter profile over search/inspect, not the local MCP tool contract.
* Remote MCP, OAuth, hosted sync, tenancy, billing, ChatGPT App SDK UI, cloud architecture, and hosted data access remain deferred.

Task splitting rules:

* Keep each task buildable and testable.
* Keep root and `specs/` mirrors synchronized when touched.
* Update public contracts before implementation tasks depend on them.
* Prefer focused PRs that either finish local MCP behavior or move one shared behavior behind data access.

## 3. Definition of Done

Each implementation task is done only when:

* Public behavior matches the owning spec.
* Relevant unit and integration tests pass.
* CLI/MCP parity is preserved where both adapters expose the behavior.
* No command writes outside the intended project paths.
* No command introduces network, cloud, embeddings, or hosted-service dependencies.
* Existing unrelated files are not rewritten or reformatted.
* A save/no-save memory decision is made after meaningful work.

## 4. Roadmap Tasks

### T001: Rebaseline Specs, PRD, Capability Map, and Guardrail Tests

Goal:

Rebaseline product and API docs around the local MCP contract and local-now/cloud-later integration story.

Acceptance:

* Mirrored specs are synchronized.
* Capability maps list object inspection as a shared `inspect_memory` and `aictx inspect` capability.
* Object inspection is absent from CLI-only capability lists.
* Legacy roadmap references and deprecated four-tool wording are removed.
* Guardrail tests expect the local MCP tool set.

### T002: Add `inspect_memory` to Local MCP

Goal:

Expose `inspect_memory({ id, project_root? })` over the existing inspect behavior.

Acceptance:

* MCP registers `inspect_memory` as a read-only tool.
* Output matches `aictx inspect --json`.
* Missing IDs return the shared `AICtxObjectNotFound` envelope.
* Global `project_root` targeting works.
* No create/update/delete object or relation tools are added.

### T003: Harden Local MCP Startup and Targeting

Goal:

Improve MCP startup, project-root targeting, stderr diagnostics, and client-launch docs for local harnesses.

Acceptance:

* MCP startup writes no non-protocol stdout.
* Startup failures produce useful stderr diagnostics.
* `project_root` is documented as project selection, not arbitrary filesystem access.
* Client launch examples cover global, package-manager, and local-binary forms.

### T004: Align MCP Schemas, Errors, Metadata, and Envelopes

Goal:

Make local MCP schemas and results mirror current CLI behavior for the routine tools.

Acceptance:

* Tool inputs reject unknown fields.
* Error envelopes match CLI JSON codes, messages, details, warnings, and meta where applicable.
* Result envelopes include structured content matching the text JSON payload.
* Tool annotations correctly mark read and write behavior.

### T005: Add Full Local MCP Workflow Tests

Goal:

Cover load, search, inspect, save patch, diff, global project targeting, and stdout safety end to end.

Acceptance:

* Workflow tests call all routine MCP tools.
* Tests prove global MCP can target multiple initialized projects via `project_root`.
* Tests prove MCP does not expose CLI-only, shell, filesystem, or low-level graph mutation tools.
* Tests prove stderr/stdout safety for client launch.

### T006: Update MCP Docs, README, Agent Guidance, Agent Recipes, Install Examples, and Release Checks

Goal:

Bring user-facing docs, agent recipes, and generated agent guidance in line with the local MCP story.

Acceptance:

* README, public docs, agent recipes, and generated guidance list the local MCP tools.
* Guidance says CLI is default and MCP is available when the client already exposes Aictx tools.
* Docs keep setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs, suggest, audit, and stale outside local MCP, with graph inspection available in the CLI and local viewer but still outside MCP.
* Release/package checks validate updated guidance.

### T007: Specify and Implement the Host-Neutral Data-Access Service Contract

Goal:

Create the shared internal data-access service for load, search, inspect, diff, and structured patch writes.

Acceptance:

* Contract matches `aictx-data-access-spec.md`.
* The service resolves one project root and one `.aictx/` boundary per operation.
* The service uses current `AppResult` envelopes and metadata.
* No adapter-specific behavior leaks into the core contract.

### T008: Move Shared Read Behavior Behind Data Access

Goal:

Route load, search, inspect, and diff reads through the shared data-access service.

Acceptance:

* CLI and MCP read adapters use the same data-access read functions.
* Existing CLI JSON output remains stable.
* Existing MCP structured content remains stable.
* Read behavior remains safe outside Git where supported.

### T009: Move Structured Patch Writes Behind Data Access

Goal:

Route CLI save and MCP `save_memory_patch` through the shared data-access write function.

Acceptance:

* `aictx save --stdin`, `aictx save --file`, and `save_memory_patch` share the same structured patch write path.
* Dirty touched-file backup, repair/quarantine, locking, event append, and index update behavior remains unchanged.
* MCP still exposes no write primitive except `save_memory_patch`.

### T010: Add Host Adapter Profiles

Goal:

Represent local MCP now and future ChatGPT-compatible search/fetch mapping later as adapter profiles over data access.

Acceptance:

* Local MCP profile preserves the Aictx-specific tool names.
* Future generic `search` maps to data-access search.
* Future generic `fetch` maps to data-access inspect.
* Future profile code or docs remain inactive unless explicitly selected.

### T011: Add Shared CLI/MCP Behavior Tests

Goal:

Prove both adapters use the same data-access semantics.

Acceptance:

* Tests compare CLI and MCP envelopes for load, search, inspect, diff, and save.
* Tests include global project targeting and non-Git behavior.
* Tests fail if CLI/MCP behavior forks for shared operations.

### T012: Update Docs and Guidance with Local-Now/Cloud-Later Story

Goal:

Make the integration story durable across specs, public docs, README, generated agent guidance, and release checks.

Acceptance:

* Docs explain that local MCP is the near-term integration path.
* Docs reserve remote/cloud/ChatGPT App SDK work as future.
* Docs describe ChatGPT-compatible `search`/`fetch` as a future adapter mapping, not local MCP tool names.
* Agent guidance remains concise and actionable.

## 5. Pull Request Slices

Recommended slices:

```text
PR 1: T001-T006 local MCP excellence
PR 2: T007 data-access contract foundation
PR 3: T008-T009 shared read/write migration
PR 4: T010-T011 adapter profiles and shared behavior tests
PR 5: T012 docs and release hardening
```

Rules:

* A PR may be smaller than a slice.
* Do not combine remote/cloud architecture with these local tasks.
* Do not parallelize tasks that edit the same MCP registration, capability map, generated guidance, or data-access service files without coordination.

## 6. Completion Criteria

This sequence is complete when:

* Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`, `remember_memory`, `save_memory_patch`, and `diff_memory`.
* `inspect_memory` returns the same object/body/relation envelope as `aictx inspect --json`.
* `remember_memory` is the routine MCP write primitive; `save_memory_patch` remains the advanced structured patch primitive.
* CLI and MCP shared operations use the host-neutral data-access service.
* Root/spec mirrors, agent recipes, and generated guidance are synchronized.
* Tests cover local MCP workflow, global project targeting, stdout safety, and CLI/MCP shared behavior.
* No remote MCP, OAuth, hosted sync, tenancy, billing, embeddings, ChatGPT App SDK UI, or cloud architecture has been implemented as part of this sequence.
