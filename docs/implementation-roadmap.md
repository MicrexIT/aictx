# Aictx Implementation Roadmap

## 1. Purpose

This roadmap splits Aictx v1 into implementation tasks that can be assigned to coding agents one at a time.

The goal is not to describe the product again. The goal is to give future implementation sessions small, ordered, testable work units with clear ownership.

This roadmap depends on:

* `prd.md`
* `storage-format-spec.md`
* `mcp-and-cli-api-spec.md`
* `indexing-and-context-compiler-spec.md`
* `schemas-and-validation-spec.md`
* `runtime-and-project-architecture-spec.md`

## 2. Roadmap Principles

Implementation must preserve these invariants:

* Git is optional for core memory operations.
* `.aictx/` lives inside the user's resolved project directory.
* Git-backed diff, history, restore, rewind, dirty-state checks, and branch/commit provenance are enabled when Git is available.
* Aictx never commits automatically.
* Canonical memory lives in `.aictx/` files.
* SQLite and context packs are generated.
* CLI and MCP share application services.
* All writes go through structured patches.
* Aictx does not semantically derive memory from diffs.
* No embeddings, cloud account, hosted service, API keys, telemetry, or network dependency in v1.

Task splitting rules:

* A task should usually touch one module area.
* A task should include tests unless it is pure scaffolding.
* A task should not require unrelated future tasks to be complete.
* A task should leave the project buildable.
* A task should not duplicate logic already owned by another module.
* A task should avoid changing public contracts unless the relevant spec is updated first.
* Task dependencies are authoritative; task numbers are stable references, not permission to ignore dependencies.
* If a task lists assignable subtasks, assign the subtasks to coding agents instead of assigning the parent task as one unit.
* A parent task with subtasks is complete only when all subtasks pass the parent acceptance criteria.

## 3. Recommended Implementation Order

Build in this order:

```text
Foundation
  -> schemas and standalone validation
  -> core infrastructure
  -> storage read
  -> cross-file validation
  -> init
  -> SQLite index
  -> context compiler
  -> patch write path
  -> CLI adapters
  -> Git history/restore
  -> MCP adapter
  -> end-to-end hardening
  -> release packaging
```

Reasoning:

* Storage and validation must exist before safe writes.
* Indexing must exist before useful `load` and `search`.
* Patch writes should come after storage, validation, hashing, and events are stable.
* CLI should be implemented before MCP because it is easier to test and debug.
* MCP should remain a thin adapter over already-tested application services.

## 4. Definition of Done for Every Task

Each implementation task is done only when:

* `pnpm typecheck` passes.
* Relevant unit tests pass.
* Relevant integration tests pass when the task affects CLI, Git, storage, index, or MCP behavior.
* Public behavior matches the owning spec.
* No command requires network access.
* No command writes outside the intended paths.
* Existing unrelated files are not rewritten or reformatted.

## 5. Agent Handoff Template

Use this template when assigning a task to a coding agent:

```text
Implement roadmap task <TASK_ID>: <TASK_TITLE>.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- <task-specific spec files>

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

## 6. Phase 0: Repository Foundation

### T001: Create Package Scaffold

Goal:

Create the TypeScript package skeleton required by `runtime-and-project-architecture-spec.md`.

Write scope:

```text
package.json
pnpm-lock.yaml
tsconfig.json
tsup.config.ts
vitest.config.ts
scripts/copy-schemas.mjs
scripts/generate-agent-guidance.mjs
src/
test/
docs/
integrations/
```

Depends on:

```text
None
```

Implementation:

* Create `package.json` with the required scripts, binaries, dependencies, engine, and module type.
* Create TypeScript, tsup, and Vitest configs.
* Create the directory layout from the architecture spec.
* Move or copy planning specs into `docs/` if implementation begins in this same repo.
* Add minimal placeholder entry points that compile.
* Add `build:guidance` and a minimal deterministic guidance generator so `pnpm build` works from the scaffold.
* Add minimal placeholder guidance content if final guidance text is implemented later in `T050`.

Assignable subtasks:

* `T001A`: Create `package.json`, TypeScript config, tsup config, Vitest config, schema copy script, and guidance generation script.
* `T001B`: Create source, test, script, docs, and integrations directory skeleton with placeholder entry points and placeholder guidance template.
* `T001C`: Add scaffold smoke tests and verify build/typecheck/test scripts.

Acceptance:

* `pnpm install` succeeds.
* `pnpm build` succeeds.
* `pnpm typecheck` succeeds.
* `pnpm test` succeeds with an empty or smoke test suite.
* `dist/cli/main.js` and `dist/mcp/server.js` are produced.
* `pnpm build` runs `build:guidance` successfully even before final guidance content is written.

### T002: Add Core Result, Error, and Domain Types

Goal:

Define shared TypeScript types used by all modules.

Write scope:

```text
src/core/result.ts
src/core/errors.ts
src/core/types.ts
src/core/logger.ts
test/unit/core/
```

Depends on:

```text
T001
```

Implementation:

* Add `Result<T>`, `AictxError`, `ValidationIssue`, `AictxMeta`, and `GitState`.
* Add string unions for object types, statuses, predicates, event types, actors, scope kinds, and patch operations.
* Add helper constructors for success and error results.
* Add stable error-code constants matching `mcp-and-cli-api-spec.md`.
* Add quiet default logger with stderr-only debug support.

Assignable subtasks:

* `T002A`: Add domain types, string unions, and error-code constants.
* `T002B`: Add result helpers, logger, and unit tests.

Acceptance:

* Error-code list matches the API spec.
* Type tests or unit tests cover result constructors.
* No module outside `core` is required for this task.

### T003: Add Clock and Deterministic Test Utilities

Goal:

Make timestamps deterministic in tests and injectable in application services.

Write scope:

```text
src/core/clock.ts
test/fixtures/
test/unit/core/
```

Depends on:

```text
T001
T002
```

Implementation:

* Add a `Clock` interface.
* Add system clock and fixed clock implementations.
* Add helpers for ISO 8601 timestamps with timezone offsets.
* Add test fixtures for fixed timestamps.

Acceptance:

* Tests can produce stable event timestamps.
* No production code calls `new Date()` directly outside the clock module after this task.

## 7. Phase 1: Schemas and Validation

### T004: Commit Bundled Schema Files

Goal:

Add exact v1 JSON Schema files from `schemas-and-validation-spec.md`.

Write scope:

```text
src/schemas/config.schema.json
src/schemas/object.schema.json
src/schemas/relation.schema.json
src/schemas/event.schema.json
src/schemas/patch.schema.json
test/unit/schemas/
```

Depends on:

```text
T001
```

Implementation:

* Create bundled schema files.
* Add tests that parse all schema JSON files.
* Add tests that verify schema `$id` values.
* Add tests that verify `scripts/copy-schemas.mjs` copies schemas into `dist/schemas/`.

Assignable subtasks:

* `T004A`: Add the five bundled schema files from `schemas-and-validation-spec.md`.
* `T004B`: Add schema parse, `$id`, and copy-script tests.

Acceptance:

* All schema files parse as JSON.
* `pnpm build` includes schema files in `dist/schemas/`.
* Schema filenames match the storage spec.

### T005: Implement Schema Loader and Ajv Validators

Goal:

Compile and run project-local JSON Schemas.

Write scope:

```text
src/validation/schemas.ts
src/validation/validate.ts
test/unit/validation/
```

Depends on:

```text
T002
T004
```

Implementation:

* Load schemas from `.aictx/schema/`.
* Compile schemas with Ajv Draft 2020-12.
* Add validators for config, object, relation, event, and patch.
* Convert Ajv errors into `ValidationIssue`.
* Return `AICtxSchemaValidationFailed` for schema failures.

Acceptance:

* Valid examples from specs pass.
* Invalid examples fail with stable issue codes.
* Validation does not mutate files.

### T006: Implement Conflict Marker Detection

Goal:

Detect unresolved conflict markers in canonical files.

Write scope:

```text
src/validation/conflicts.ts
test/unit/validation/conflicts.test.ts
```

Depends on:

```text
T002
```

Implementation:

* Scan canonical text files only.
* Exclude `.aictx/index/` and `.aictx/context/`.
* Detect the marker regexes from `schemas-and-validation-spec.md`.
* Return `AICtxConflictDetected` issues.

Acceptance:

* Conflict markers in JSON, JSONL, and Markdown are errors.
* Generated files are ignored.
* Line numbers are reported when available.

### T007: Implement Secret Detection

Goal:

Detect obvious secrets before writes and during checks.

Write scope:

```text
src/validation/secrets.ts
test/unit/validation/secrets.test.ts
```

Depends on:

```text
T002
```

Implementation:

* Implement block and warn rules from `schemas-and-validation-spec.md`.
* Implement Shannon entropy check for long high-entropy strings.
* Avoid printing secret values.
* Support scanning patch string fields and canonical files.

Acceptance:

* Block-level secret findings prevent writes.
* Warn-level findings are returned without blocking reads.
* Test output never includes the secret value.

## 8. Phase 2: Core Infrastructure

### T008: Implement Safe Filesystem Helpers

Goal:

Centralize safe path handling and atomic text writes.

Write scope:

```text
src/core/fs.ts
test/unit/core/fs.test.ts
```

Depends on:

```text
T002
```

Implementation:

* Add UTF-8 read/write helpers.
* Normalize Markdown line endings to LF on writes.
* Add deterministic JSON write helper with two-space indentation.
* Add JSONL append helper.
* Add path containment checks for `.aictx/`.
* Add atomic write helper using temp file and rename.

Acceptance:

* Attempts to write outside allowed roots fail.
* JSON output is deterministic.
* Markdown CRLF input normalizes to LF.
* JSONL append writes exactly one LF-terminated object.

### T009: Implement Native Git Wrapper

Goal:

Provide safe Git operations through argv-based subprocess calls.

Write scope:

```text
src/core/git.ts
src/core/subprocess.ts
test/unit/core/git.test.ts
test/integration/git/
```

Depends on:

```text
T002
T008
```

Implementation:

* Implement `git rev-parse --show-toplevel`.
* Implement branch and commit metadata.
* Implement `.aictx/` dirty-state detection.
* Implement `.aictx/` diff.
* Implement `.aictx/` log.
* Implement restore from commit for `.aictx/`.
* Ensure all Git calls use argv arrays.

Assignable subtasks:

* `T009A`: Implement subprocess wrapper, optional Git root detection, branch detection, and commit metadata.
* `T009B`: Implement `.aictx/` dirty-state detection and `.aictx/` diff.
* `T009C`: Implement `.aictx/` scoped log and restore helpers used by history/restore tasks.

Acceptance:

* Outside Git returns a "Git unavailable" result without failing root resolution.
* Detached HEAD reports Git as available with `branch: null`, not `branch: "HEAD"`.
* Dirty-state ignores `.aictx/index/`, `.aictx/context/`, and `.aictx/.lock`.
* Diff only includes `.aictx/`.
* Tests verify no shell string execution path.

### T010: Implement Project Root Resolution

Goal:

Resolve project root and `.aictx/` root consistently for CLI and MCP in Git and non-Git projects.

Write scope:

```text
src/core/paths.ts
test/unit/core/paths.test.ts
test/integration/paths/
```

Depends on:

```text
T009
```

Implementation:

* Resolve project root from `cwd` using Git when available.
* Outside Git, resolve `init` to `cwd`.
* Outside Git for non-init commands, walk upward to the nearest `.aictx/config.json`.
* Resolve `.aictx/` root.
* Return `AICtxNotInitialized` for non-init commands when missing.
* Prevent Aictx roots outside the resolved project root.

Acceptance:

* Nested cwd inside a repo resolves to Git root.
* Nested cwd outside Git resolves by walking upward to the nearest `.aictx/config.json`.
* Non-Git `init` resolves to `cwd`.
* Missing `.aictx/` fails except for init.

### T011: Implement Project Lock

Goal:

Protect canonical writes and rebuilds from concurrent processes.

Write scope:

```text
src/core/lock.ts
test/unit/core/lock.test.ts
test/integration/lock/
```

Depends on:

```text
T008
T010
```

Implementation:

* Use atomic exclusive create for `.aictx/.lock`.
* Write lock payload with `pid`, `created_at`, and `operation`.
* Release lock after operation.
* Return `AICtxLockBusy` when lock exists.
* Add stale-lock warning if older than 1 hour.
* Implement init edge-case where `.aictx/` is created before lock acquisition.

Acceptance:

* Concurrent lock acquisition fails deterministically.
* Lock file is removed on successful completion.
* Existing lock is not automatically removed.

## 9. Phase 3: Storage Read, Init, Hashing, and Events

### T012: Implement ID and Slug Generation

Goal:

Generate deterministic object and relation IDs.

Write scope:

```text
src/core/ids.ts
test/unit/core/ids.test.ts
```

Depends on:

```text
T002
```

Implementation:

* Slugify titles using lowercase ASCII, numbers, and hyphens.
* Generate `<type>.<slug>`.
* Generate deterministic numeric suffixes on collision.
* Generate relation IDs from `from`, `predicate`, and `to`.

Acceptance:

* ID generation matches storage and patch specs.
* Collision suffixes are deterministic.
* Invalid characters are removed or normalized predictably.

### T013: Implement Markdown Helpers

Goal:

Read and inspect Markdown bodies.

Write scope:

```text
src/storage/markdown.ts
test/unit/storage/markdown.test.ts
```

Depends on:

```text
T008
```

Implementation:

* Read Markdown as UTF-8.
* Reject YAML frontmatter when validating.
* Extract first H1 when present.
* Normalize LF for hashing.

Acceptance:

* H1 extraction works.
* Frontmatter is detected.
* LF normalization is deterministic.

### T014: Implement Canonical JSON and Hashing

Goal:

Compute object and relation hashes.

Write scope:

```text
src/storage/hashes.ts
test/unit/storage/hashes.test.ts
```

Depends on:

```text
T008
T013
```

Implementation:

* Implement canonical JSON serialization from `schemas-and-validation-spec.md`.
* Compute object hash from sidecar without `content_hash` plus normalized Markdown body.
* Compute relation hash from relation without `content_hash`.
* Return `sha256:<lowercase-hex>`.

Acceptance:

* Hashes are reproducible across key order changes.
* CRLF and LF Markdown hash identically after normalization.
* Existing `content_hash` does not affect recomputation.

### T015: Implement Canonical Storage Reader

Goal:

Load `.aictx/` canonical files into domain objects.

Write scope:

```text
src/storage/read.ts
src/storage/objects.ts
src/storage/relations.ts
src/storage/events.ts
test/unit/storage/read.test.ts
```

Depends on:

```text
T005
T008
T013
```

Implementation:

* Read `config.json`.
* Discover object sidecars.
* Load Markdown bodies.
* Discover relation files.
* Parse `events.jsonl` with line numbers.
* Return structured storage snapshot.

Assignable subtasks:

* `T015A`: Read config, object sidecars, Markdown bodies, and object paths.
* `T015B`: Read relation files, parse events JSONL with line numbers, and assemble the storage snapshot.

Acceptance:

* Invalid JSON and JSONL are reported.
* Blank JSONL lines are errors.
* Events include 1-based line numbers.
* Generated directories are ignored.

### T016: Implement Cross-File Validation

Goal:

Validate relationships between canonical files beyond JSON Schema.

Write scope:

```text
src/validation/validate.ts
test/unit/validation/
```

Depends on:

```text
T005
T006
T015
```

Implementation:

* Detect duplicate object IDs.
* Detect duplicate relation IDs.
* Detect missing Markdown bodies.
* Validate relation endpoints.
* Validate object ID prefix matches object type.
* Validate status rules by object type.
* Validate scope kind rules.
* Warn on title/H1 mismatch.
* Warn on superseded objects without replacement.

Assignable subtasks:

* `T016A`: Validate object identity, object status, scope kind rules, Markdown body presence, and title/H1 warning.
* `T016B`: Validate relation IDs, relation endpoint existence, duplicate equivalent relations, and superseded-object warnings.

Acceptance:

* Cross-file validation catches all errors listed in `schemas-and-validation-spec.md`.
* Warnings and errors use stable shapes.
* Validation can run on an initialized sample `.aictx/`.

### T017: Implement Event Builder and JSONL Append

Goal:

Append semantic events for patch operations.

Write scope:

```text
src/storage/events.ts
test/unit/storage/events.test.ts
```

Depends on:

```text
T003
T005
T008
T015
```

Implementation:

* Build event objects for memory and relation operations.
* Append JSONL lines deterministically.
* Validate generated events against schema.
* Do not append `index.rebuilt` during rebuild.

Acceptance:

* Each write operation maps to the correct event type.
* Events are LF-terminated JSONL.
* Event examples validate.

### T018: Implement `aictx init` Storage Creation Service

Goal:

Create a valid `.aictx/` project layout.

Write scope:

```text
src/storage/init.ts
src/app/operations.ts
test/integration/init/
```

Depends on:

```text
T004
T010
T011
T012
T014
T015
T016
```

Implementation:

* Support initialization inside Git and non-Git project directories.
* Create `.aictx/`.
* Acquire init lock.
* Create default config.
* Create default project and architecture memory files.
* Create schema files from bundled schemas.
* Create empty `events.jsonl`.
* Create generated directories.
* Add or recommend `.gitignore` entries when Git is available.
* Build initial index when index module is available, otherwise return `index_built: false` with warning until T020.

Assignable subtasks:

* `T018A`: Implement project preconditions, `.aictx/` creation, lock acquisition, config, schema files, generated directories, and `events.jsonl`.
* `T018B`: Create default project and architecture memory files with valid hashes.
* `T018C`: Add or recommend `.gitignore` entries and return init response data including temporary `index_built: false` and onboarding `next_steps`.

Acceptance:

* Init creates valid storage.
* Init does not commit.
* Init outside Git succeeds in local mode.
* Re-running init on valid storage returns success with warning.
* Init response includes concise next steps for load, save, and diff.

## 10. Phase 4: SQLite Index and Search

### T019: Implement SQLite Connection and Migrations

Goal:

Create and open the generated SQLite database.

Write scope:

```text
src/index/sqlite.ts
src/index/migrations.ts
test/unit/index/sqlite.test.ts
```

Depends on:

```text
T001
T008
```

Implementation:

* Open `.aictx/index/aictx.sqlite`.
* Create schema version `1`.
* Create tables and indexes from `indexing-and-context-compiler-spec.md`.
* Include denormalized scope columns and indexes for deterministic scope filtering.
* Store required `meta` rows.
* Use transactions for writes.

Acceptance:

* Empty database migrates to schema version `1`.
* Required tables and indexes exist.
* Connection closes cleanly.

### T020: Implement Full Index Rebuild

Goal:

Rebuild SQLite from canonical files.

Write scope:

```text
src/index/rebuild.ts
src/app/operations.ts
test/integration/index/rebuild.test.ts
```

Depends on:

```text
T015
T019
T016
```

Implementation:

* Validate canonical files enough to rebuild safely.
* Populate objects, relations, events, and FTS.
* Write meta rows.
* Replace database atomically where practical.
* Preserve previous valid index on rebuild failure where practical.
* Do not mutate canonical files.
* Expose `rebuildIndex` application service.
* Update `initProject` so init builds the initial index when possible.

Assignable subtasks:

* `T020A`: Rebuild objects, denormalized scope columns, and relations tables from canonical storage inside a transaction.
* `T020B`: Rebuild events, FTS rows, meta rows, and atomic database replacement.
* `T020C`: Expose `rebuildIndex` and connect successful rebuild to `initProject`.

Acceptance:

* Rebuild indexes valid storage.
* Rebuild does not append events.
* Deleting `.aictx/index/` loses no memory.
* Invalid canonical files prevent replacing valid index.
* Init returns `index_built: true` when rebuild succeeds.

### T021: Implement Incremental Index Update

Goal:

Update SQLite after successful patch writes.

Write scope:

```text
src/index/incremental.ts
test/unit/index/incremental.test.ts
test/integration/index/incremental.test.ts
```

Depends on:

```text
T020
```

Implementation:

* Update touched objects.
* Update touched relations.
* Index newly appended events.
* Update FTS rows.
* Fall back to full rebuild on incremental failure when auto-indexing is enabled.

Acceptance:

* Incremental update matches full rebuild result for touched changes.
* Failure after canonical write returns index warning, not failed save.

### T022: Implement Search

Goal:

Support `search_memory` and optional `aictx search` backend.

Write scope:

```text
src/index/search.ts
src/app/operations.ts
test/unit/index/search.test.ts
test/integration/index/search.test.ts
```

Depends on:

```text
T020
```

Implementation:

* Normalize query text.
* Search exact IDs and body paths.
* Search `objects_fts`.
* Merge and de-duplicate by object ID.
* Exclude rejected memory by default.
* Return scores and snippets.
* Expose `searchMemory` application service.

Assignable subtasks:

* `T022A`: Implement query validation, exact ID search, body-path search, and limit handling.
* `T022B`: Implement FTS search, snippets, de-duplication, rejected filtering, and deterministic scoring.
* `T022C`: Expose `searchMemory` through application service and integration tests.

Acceptance:

* Search does not require embeddings.
* Limit validation follows spec.
* Results expose status clearly.
* Ranking is deterministic.

## 11. Phase 5: Context Compiler

### T023: Implement Token Estimation

Goal:

Estimate context pack budget without external tokenizers.

Write scope:

```text
src/context/tokens.ts
test/unit/context/tokens.test.ts
```

Depends on:

```text
T002
```

Implementation:

* Implement deterministic approximate token counting.
* Enforce minimum and maximum token budget.
* Match `indexing-and-context-compiler-spec.md` budget rules.

Acceptance:

* Token budgets below minimum are rejected.
* Budgets above maximum are capped.
* Counting is deterministic.

### T024: Implement Ranking

Goal:

Rank candidate memory for task-specific context.

Write scope:

```text
src/context/rank.ts
test/unit/context/rank.test.ts
```

Depends on:

```text
T022
```

Implementation:

* Implement scoring rules from `indexing-and-context-compiler-spec.md`.
* Apply type/status weighting.
* Apply deterministic recent-memory boost.
* Apply relation-neighborhood boost.
* Apply scope filtering for project, branch, and task scopes.
* Exclude stale, superseded, rejected, and conflicted memory from high-priority sections by default.

Acceptance:

* Same inputs produce same order.
* Rejected memory is excluded from default load output.
* Stale and superseded memory are not placed in `Must know` by default.
* Branch-scoped memory is included only when the current branch matches.
* Branch-scoped memory is excluded in detached HEAD state.
* Task-scoped memory is included only for strong task matches.

### T025: Implement Context Pack Renderer

Goal:

Render Markdown context packs.

Write scope:

```text
src/context/render.ts
test/unit/context/render.test.ts
```

Depends on:

```text
T023
T024
```

Implementation:

* Render required context pack sections.
* Include local project provenance and Git provenance when available.
* Include included/excluded IDs.
* Label memory as project memory, not system instructions.
* Respect maximum structure from context spec.

Acceptance:

* Context pack is valid Markdown.
* Output fits token budget as closely as practical.
* Provenance is included.

### T026: Implement Context Compiler Service

Goal:

Wire search, ranking, and rendering into `loadMemory`.

Write scope:

```text
src/context/compile.ts
src/app/operations.ts
test/integration/context/load.test.ts
```

Depends on:

```text
T020
T022
T023
T024
T025
```

Implementation:

* Compile context for a task.
* Resolve current project ID and optional Git branch for scope filtering.
* Auto-rebuild index when missing or stale and config allows.
* Return `AICtxIndexUnavailable` when required.
* Optionally save generated context pack when config allows.

Acceptance:

* `loadMemory` works using only local files and SQLite FTS.
* Missing index auto-rebuilds when enabled.
* No network access is required.

## 12. Phase 6: Patch Write Path

### T027: Implement Patch Validation Planner

Goal:

Validate a full patch and produce a write plan before touching disk.

Write scope:

```text
src/storage/patch.ts
test/unit/storage/patch-planner.test.ts
```

Depends on:

```text
T005
T016
T012
T014
T015
T017
```

Implementation:

* Validate patch schema.
* Validate operation semantics.
* Generate missing object and relation IDs.
* Resolve file paths.
* Detect dirty touched files before write.
* Detect overwrite conflicts.
* Plan all file writes and deletes.

Assignable subtasks:

* `T027A`: Validate patch schema, defaults, generated IDs, and resolved output paths.
* `T027B`: Validate operation semantics against the current storage snapshot.
* `T027C`: Detect dirty touched files, overwrite conflicts, and produce the staged write/delete plan.

Acceptance:

* Invalid patch fails before disk writes.
* Empty changes fail.
* Unknown operation fails.
* Dirty touched files fail with `AICtxDirtyMemory`.

### T028: Implement Relation Patch Operations

Goal:

Apply relation operations through the planner.

Write scope:

```text
src/storage/patch.ts
src/storage/write.ts
test/unit/storage/relation-patch.test.ts
```

Depends on:

```text
T027
```

Implementation:

* Implement `create_relation`.
* Implement `update_relation`.
* Implement `delete_relation`.
* Enforce immutable `from`, `predicate`, and `to` on update.
* Append relation events.

Acceptance:

* Relation endpoint validation works.
* Duplicate equivalent relations are rejected.
* Relation event counts are correct.

### T029: Implement Object Patch Operations

Goal:

Apply object operations through the planner.

Write scope:

```text
src/storage/patch.ts
src/storage/write.ts
test/unit/storage/object-patch.test.ts
```

Depends on:

```text
T027
T028
```

Implementation:

* Implement `create_object`.
* Implement `update_object`.
* Implement `mark_stale`.
* Implement `supersede_object`.
* Implement `delete_object`.
* Update hashes.
* Append memory events.

Assignable subtasks:

* `T029A`: Implement `create_object` and `update_object`.
* `T029B`: Implement `mark_stale` and `supersede_object`, including the `supersedes` relation behavior.
* `T029C`: Implement `delete_object`, active relation protection, hash updates, and memory event assertions.

Acceptance:

* Object sidecars and Markdown bodies are correct.
* Status rules are enforced.
* Delete rejects active relation references.
* Supersede creates or preserves a `supersedes` relation.

### T030: Implement Save Application Service

Goal:

Expose patch writes through `saveMemoryPatch`.

Write scope:

```text
src/app/operations.ts
test/integration/save/
```

Depends on:

```text
T011
T021
T027
T028
T029
T007
```

Implementation:

* Resolve project.
* Acquire lock.
* Detect conflicts.
* Run secret detection.
* Apply patch.
* Append events.
* Update or rebuild index.
* Return API success envelope data.
* Never commit.

Assignable subtasks:

* `T030A`: Implement save preconditions: project resolution, lock, conflict detection, dirty checks, and secret detection.
* `T030B`: Wire patch application, event writing, hash updates, and response data.
* `T030C`: Wire incremental/full index update behavior and warning handling after successful canonical writes.

Acceptance:

* Successful save changes canonical files and index.
* Save rejects unresolved conflicts.
* Save rejects block-level secrets.
* When Git is available, save leaves Git changes uncommitted.

## 13. Phase 7: CLI Adapters

### T031: Implement CLI Main and Shared Rendering

Goal:

Create the CLI adapter foundation.

Write scope:

```text
src/cli/main.ts
src/cli/render.ts
src/cli/exit.ts
test/unit/cli/
```

Depends on:

```text
T002
T018
```

Implementation:

* Use `commander`.
* Add global `--json` handling where required.
* Render shared response envelope for JSON.
* Render human-readable errors to stderr.
* Map error classes to exit codes.

Acceptance:

* Usage errors exit `2`.
* Git/storage precondition errors exit `3`.
* Validation and patch errors exit `1`.
* JSON mode prints only JSON to stdout.

### T032: Implement `aictx init`

Goal:

Expose init through CLI.

Write scope:

```text
src/cli/commands/init.ts
test/integration/cli/init.test.ts
```

Depends on:

```text
T018
T020
T031
```

Implementation:

* Wire command to `initProject`.
* Support `--json`.
* Print created files and warnings in human output.
* Print next steps in human output.

Acceptance:

* `aictx init --json` returns success envelope.
* Human output is concise.
* Init outside Git returns a success envelope with `meta.git.available: false`.

### T033: Implement `aictx check` and `aictx rebuild`

Goal:

Expose validation and rebuild through CLI.

Write scope:

```text
src/cli/commands/check.ts
src/cli/commands/rebuild.ts
src/app/operations.ts
test/integration/cli/check-rebuild.test.ts
```

Depends on:

```text
T020
T031
T007
T016
```

Implementation:

* Wire `checkProject`.
* Wire `rebuildIndex`.
* Implement `checkProject` application service if not already present.
* Ensure neither mutates canonical files.
* Return validation issue details.

Assignable subtasks:

* `T033A`: Implement `checkProject` service and `aictx check`.
* `T033B`: Implement `aictx rebuild` adapter over `rebuildIndex`.

Acceptance:

* Invalid JSONL causes check failure.
* Rebuild recreates missing SQLite.
* Rebuild does not append events.

### T034: Implement `aictx save`

Goal:

Expose patch writes through CLI.

Write scope:

```text
src/cli/commands/save.ts
test/integration/cli/save.test.ts
```

Depends on:

```text
T030
T031
```

Implementation:

* Support `--file`.
* Support `--stdin`.
* Require exactly one input source.
* Parse patch JSON.
* Wire to `saveMemoryPatch`.

Acceptance:

* `save --stdin` and `save --file` use same write path.
* Invalid JSON exits `1`.
* Missing input source exits `2`.

### T035: Implement `aictx load` and `aictx search`

Goal:

Expose context compilation and search through CLI.

Write scope:

```text
src/cli/commands/load.ts
src/cli/commands/search.ts
test/integration/cli/load-search.test.ts
```

Depends on:

```text
T026
T031
```

Implementation:

* Wire `loadMemory`.
* Wire `searchMemory`.
* Support `--token-budget` for load.
* Support `--limit` for search.
* Render Markdown by default for load.

Assignable subtasks:

* `T035A`: Implement `aictx load`.
* `T035B`: Implement `aictx search`.

Acceptance:

* `aictx load` returns Markdown by default.
* `aictx load --json` returns envelope.
* Search returns local SQLite FTS results.

### T036: Implement `aictx diff`

Goal:

Expose `.aictx/`-scoped diff.

Write scope:

```text
src/cli/commands/diff.ts
src/app/operations.ts
test/integration/cli/diff.test.ts
```

Depends on:

```text
T009
T031
```

Implementation:

* Wire `diffMemory`.
* Include changed files.
* Include changed memory and relation IDs when detectable.

Acceptance:

* Diff excludes non-Aictx repository changes.
* Diff works when `.aictx/` is dirty.

### T037: Implement Optional Read-Only CLI Commands

Goal:

Expose debugging and inspection commands.

Write scope:

```text
src/cli/commands/inspect.ts
src/cli/commands/stale.ts
src/cli/commands/graph.ts
test/integration/cli/read-only.test.ts
```

Depends on:

```text
T015
T022
T031
```

Implementation:

* Implement `inspect <id>`.
* Implement `stale`.
* Implement `graph <id>`.
* Ensure commands do not mutate canonical files.

Acceptance:

* Inspect shows one object plus direct relations.
* Stale lists stale, superseded, and rejected memory.
* Graph returns relation neighborhood for debugging.

## 14. Phase 8: Git History and Restore

### T038: Implement `aictx history`

Goal:

Show commits that changed `.aictx/`.

Write scope:

```text
src/cli/commands/history.ts
src/app/operations.ts
test/integration/cli/history.test.ts
```

Depends on:

```text
T009
T031
```

Implementation:

* Return `AICtxGitRequired` outside Git.
* Use Git log scoped to `.aictx/`.
* Support `--limit`.
* Return commit, author, timestamp, and subject.

Acceptance:

* History excludes commits that only changed non-Aictx files.
* JSON shape matches API spec.

### T039: Implement Restore and Rewind Services

Goal:

Restore `.aictx/` from Git history.

Write scope:

```text
src/app/operations.ts
src/storage/write.ts
test/integration/restore/
```

Depends on:

```text
T009
T011
T020
```

Implementation:

* Return `AICtxGitRequired` outside Git.
* Implement restore from explicit commit.
* Implement rewind to previous committed `.aictx/` state.
* Refuse when `.aictx/` is dirty.
* Restore only `.aictx/`.
* Rebuild index after restore when possible.

Acceptance:

* Restore does not affect non-Aictx files.
* Dirty `.aictx/` blocks restore.
* Restore does not create a commit.

### T040: Implement `aictx restore` and `aictx rewind`

Goal:

Expose restore and rewind through CLI.

Write scope:

```text
src/cli/commands/restore.ts
src/cli/commands/rewind.ts
test/integration/cli/restore-rewind.test.ts
```

Depends on:

```text
T031
T039
```

Implementation:

* Wire restore command.
* Wire rewind command.
* Support `--json`.
* Render changed files and index rebuild status.

Acceptance:

* Restore requires commit argument.
* Rewind finds previous `.aictx/` commit.
* Both refuse dirty `.aictx/`.

## 15. Phase 9: MCP Server

### T041: Implement MCP Server Bootstrap

Goal:

Start an MCP stdio server.

Write scope:

```text
src/mcp/server.ts
test/integration/mcp/server.test.ts
```

Depends on:

```text
T001
T002
T010
```

Implementation:

* Use `@modelcontextprotocol/sdk`.
* Start stdio transport.
* Ensure logs go to stderr only.
* Resolve project from server process `cwd`.
* Do not expose arbitrary filesystem or shell tools.

Acceptance:

* Server starts without writing to stdout outside MCP protocol.
* Server exposes no tools before registration task except bootstrap health if needed.

### T042: Implement MCP Read Tools

Goal:

Expose `load_memory`, `search_memory`, and `diff_memory`.

Write scope:

```text
src/mcp/tools/load-memory.ts
src/mcp/tools/search-memory.ts
src/mcp/tools/diff-memory.ts
test/integration/mcp/read-tools.test.ts
```

Depends on:

```text
T026
T036
T041
```

Implementation:

* Register required read tools.
* Validate tool inputs.
* Return shared response envelopes.
* Do not mutate canonical files except auto-rebuild when config allows.

Acceptance:

* MCP load matches CLI load data.
* MCP search matches CLI search data.
* MCP diff matches CLI diff data.

### T043: Implement MCP Write Tool

Goal:

Expose `save_memory_patch`.

Write scope:

```text
src/mcp/tools/save-memory-patch.ts
test/integration/mcp/save-tool.test.ts
```

Depends on:

```text
T030
T041
T042
```

Implementation:

* Register `save_memory_patch`.
* Validate tool input.
* Serialize writes per project root.
* Call shared save application service.
* Return shared response envelope.

Acceptance:

* MCP save and CLI save produce equivalent canonical files.
* Concurrent MCP writes are serialized or return lock errors.
* Tool does not commit.

## 16. Phase 10: End-to-End Hardening

### T044: Add Golden Storage Fixtures

Goal:

Create stable fixture projects for regression tests.

Write scope:

```text
test/fixtures/
test/integration/fixtures.test.ts
```

Depends on:

```text
T018
T030
T040
```

Implementation:

* Add a minimal valid `.aictx/`.
* Add a richer project with objects, relations, and events.
* Add invalid fixtures for JSONL, missing body, bad relation, and conflict marker.

Acceptance:

* Fixtures validate or fail for expected reasons.
* Fixture hashes are deterministic.

### T045: Add Full CLI Workflow Test

Goal:

Prove the v1 CLI flow works end to end.

Write scope:

```text
test/integration/e2e/cli-workflow.test.ts
```

Depends on:

```text
T032
T033
T034
T035
T036
T038
T040
```

Implementation:

* Create temp Git repo.
* Create temp non-Git project directory.
* Run init.
* Save memory patch.
* Load context.
* Search memory.
* Show diff.
* Commit using test harness.
* Show history.
* Restore previous state.
* In the non-Git project, verify core commands work and Git-only commands return `AICtxGitRequired`.

Assignable subtasks:

* `T045A`: Add happy-path CLI workflow test through init, save, load, search, and diff.
* `T045B`: Extend CLI workflow test through commit, history, restore, and post-restore verification.
* `T045C`: Add non-Git CLI workflow test through init, save, load, search, check, rebuild, and Git-only command failures.

Acceptance:

* Workflow passes without network.
* Git diff remains reviewable.
* Restore only affects `.aictx/`.
* Non-Git core workflow passes without Git.

### T046: Add Full MCP Workflow Test

Goal:

Prove the v1 MCP flow works end to end.

Write scope:

```text
test/integration/e2e/mcp-workflow.test.ts
```

Depends on:

```text
T041
T042
T043
```

Implementation:

* Start MCP server in temp Git repo.
* Call `load_memory`.
* Call `save_memory_patch`.
* Call `search_memory`.
* Call `diff_memory`.
* Compare results to CLI services where practical.

Acceptance:

* MCP tools use the same application services.
* MCP stdout is protocol-safe.
* No arbitrary shell or filesystem tools are exposed.

### T047: Add Security and Safety Regression Tests

Goal:

Protect the v1 safety model.

Write scope:

```text
test/integration/security/
test/unit/security/
```

Depends on:

```text
T007
T009
T011
T026
T030
T041
```

Implementation:

* Verify no shell string execution in Git wrapper.
* Verify path traversal writes are rejected.
* Verify secret values are not printed.
* Verify conflict markers block writes.
* Verify MCP exposes only normalized tools.
* Verify rejected/stale/superseded memory does not enter `Must know` by default.

Acceptance:

* Safety regressions fail tests.
* No test snapshot contains secret values.

### T048: Add Performance Smoke Tests

Goal:

Ensure local operations remain acceptable on realistic small projects.

Write scope:

```text
test/integration/performance/
```

Depends on:

```text
T020
T022
T026
T030
```

Implementation:

* Generate fixture with at least 500 memory objects and 1000 relations.
* Generate at least 2500 events.
* Rebuild index.
* Search memory.
* Compile context pack.
* Save a small patch.

Acceptance:

* Tests are smoke tests, not strict benchmarks.
* Operations complete within reasonable local timeouts.
* No external services are used.

## 17. Phase 11: Documentation and Release

### T049: Write README Quickstart

Goal:

Document the basic user flow.

Write scope:

```text
README.md
```

Depends on:

```text
T045
T046
```

Implementation:

* Explain what Aictx is.
* Show install command.
* Show `aictx init`.
* Show `aictx load`.
* Show `aictx save --stdin` with a minimal structured patch example.
* Show how to review `.aictx/` files.
* Show `aictx diff` for Git projects.
* Show MCP setup conceptually.
* Link to the optional generated agent guidance and agent integration guide.

Assignable subtasks:

* `T049A`: Write CLI quickstart covering install, init, load, save, and diff.
* `T049B`: Add MCP setup section and deferred-feature guardrails.

Acceptance:

* README reflects implemented commands.
* README does not promise deferred features.

### T050: Add Agent Integration Guide and Generated Agent Guidance

Goal:

Help users insert Aictx into AI coding-agent workflows with copyable guidance generated from one shared template.

Write scope:

```text
docs/agent-integration.md
integrations/templates/agent-guidance.md
integrations/codex/aictx/SKILL.md
integrations/claude/aictx.md
integrations/generic/aictx-agent-instructions.md
scripts/generate-agent-guidance.mjs
package.json
test/unit/agent-guidance/
```

Depends on:

```text
T042
T043
T049
```

Implementation:

* Explain the one load call and one save call workflow.
* Explain that the agent creates the semantic patch.
* Include patch examples.
* Include MCP tool list.
* Include safety warning about reviewing Git diffs.
* Add one canonical guidance template under `integrations/templates/`.
* Add a generator script that produces Codex, Claude, and generic guidance files from the template.
* Verify the existing `build:guidance` hook regenerates the finalized guidance.
* Clarify that generated guidance is optional and not canonical memory.

Assignable subtasks:

* `T050A`: Write `docs/agent-integration.md` with MCP-first and CLI-fallback workflows.
* `T050B`: Add `integrations/templates/agent-guidance.md` with concise shared agent instructions.
* `T050C`: Finalize `scripts/generate-agent-guidance.mjs`, generated Codex/Claude/generic outputs, package build integration, and drift tests.

Acceptance:

* Guide does not imply Aictx derives semantic memory from diffs.
* Guide does not mention embeddings as v1 behavior.
* Generated guidance tells agents to load memory before non-trivial work and save structured patches after meaningful changes.
* Generated guidance tells agents not to edit `.aictx/` files directly or save secrets.
* Generated guidance remains optional and copyable.
* `pnpm build` regenerates guidance from the shared template.
* Tests fail if generated guidance drifts from the template.

### T051: Release Packaging Check

Goal:

Verify npm package output.

Write scope:

```text
package.json
scripts/
test/integration/release/
```

Depends on:

```text
T049
T050
```

Implementation:

* Run `pnpm pack`.
* Verify package includes `dist/`, schemas, README, license, agent integration guide, guidance template, and generated agent guidance.
* Verify package excludes unnecessary fixtures.
* Verify binaries execute from packed tarball.

Assignable subtasks:

* `T051A`: Add package-content verification for `dist/`, schemas, README, license, guidance template, generated guidance files, and fixture exclusions.
* `T051B`: Add packed-tarball binary execution checks for `aictx` and `aictx-mcp`.

Acceptance:

* `aictx --help` works from packed package.
* `aictx-mcp` starts from packed package.
* Node engine is `>=22`.

## 18. Parallelization Guidance

Safe to parallelize after T001:

```text
T002 and T004
T006 and T007
T012 and T013
T023 and CLI rendering work after service contracts are stable
T049 can draft after CLI behavior stabilizes
```

Do not parallelize without coordination:

```text
T027, T028, T029, T030
T019, T020, T021
T031 through T036 if they edit shared CLI rendering
T041 through T043 if they edit MCP server registration
```

Reasoning:

* Patch write tasks touch the same planner and writer.
* Index tasks touch schema and database lifecycle.
* CLI and MCP adapters share command registration and response rendering.

## 19. Recommended Pull Request Slices

If implementing via PRs, use these slices:

```text
PR 1: T001-T003
PR 2: T004-T007
PR 3: T008-T011
PR 4: T012-T018, including T016 after T015
PR 5: T019-T022
PR 6: T023-T026
PR 7: T027-T030
PR 8: T031-T037
PR 9: T038-T040
PR 10: T041-T043
PR 11: T044-T048
PR 12: T049-T051
```

Rules:

* A PR may be smaller than a slice.
* A PR should not combine unrelated phases.
* A PR should include tests for the behavior it adds.

## 20. V1 Completion Criteria

V1 implementation is complete when:

* `aictx init` creates valid `.aictx/` storage inside Git and non-Git project directories.
* `aictx load` works from local files and SQLite FTS.
* `aictx save --stdin` and `save_memory_patch` use the same patch write path.
* Memory changes are readable as local Markdown and JSON file changes.
* In Git projects, memory changes are readable in `git diff`.
* `aictx check` validates schemas, cross-file rules, conflict markers, hashes, and secrets.
* `aictx rebuild` recreates SQLite without mutating canonical files.
* In Git projects, `aictx history`, `restore`, and `rewind` work only on `.aictx/`.
* Outside Git, Git-only commands return `AICtxGitRequired`.
* MCP exposes only `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.
* No core command requires network access, API keys, embeddings, or hosted services.
* Write operations are protected by `.aictx/.lock`.
* Test coverage includes unit, integration, CLI workflow, MCP workflow, and safety regressions.
