# Aictx Agent Planning Handoffs

This file converts the implementation roadmap task template into ready-to-use planning handoffs. Each block is intended for a planning agent first: it should produce a concrete implementation plan, risk notes, and test strategy before any code is changed.

Use the parent task handoff for roadmap planning. If a roadmap task lists assignable subtasks, narrow the same handoff to the specific subtask write scope before implementation.

## Template

```text
Plan roadmap task <TASK_ID>: <TASK_TITLE>.

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

## T001: Create Package Scaffold

```text
Plan roadmap task T001: Create Package Scaffold.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md

Write scope:
- package.json
- pnpm-lock.yaml
- tsconfig.json
- tsup.config.ts
- vitest.config.ts
- scripts/copy-schemas.mjs
- scripts/generate-agent-guidance.mjs
- src/
- test/
- docs/
- integrations/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- `pnpm install` succeeds.
- `pnpm build` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm test` succeeds with an empty or smoke test suite.
- `dist/cli/main.js` and `dist/mcp/server.js` are produced.
- `pnpm build` runs `build:guidance` successfully even before final guidance content is written.

Run:
- pnpm typecheck
- pnpm test
- pnpm build
```

## T002: Add Core Result, Error, and Domain Types

```text
Plan roadmap task T002: Add Core Result, Error, and Domain Types.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/core/result.ts
- src/core/errors.ts
- src/core/types.ts
- src/core/logger.ts
- test/unit/core/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Error-code list matches the API spec.
- Type tests or unit tests cover result constructors.
- No module outside `core` is required for this task.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/
```

## T003: Add Clock and Deterministic Test Utilities

```text
Plan roadmap task T003: Add Clock and Deterministic Test Utilities.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md

Write scope:
- src/core/clock.ts
- test/fixtures/
- test/unit/core/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Tests can produce stable event timestamps.
- No production code calls `new Date()` directly outside the clock module after this task.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/
```

## T004: Commit Bundled Schema Files

```text
Plan roadmap task T004: Commit Bundled Schema Files.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md

Write scope:
- src/schemas/config.schema.json
- src/schemas/object.schema.json
- src/schemas/relation.schema.json
- src/schemas/event.schema.json
- src/schemas/patch.schema.json
- test/unit/schemas/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- All schema files parse as JSON.
- `pnpm build` includes schema files in `dist/schemas/`.
- Schema filenames match the storage spec.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/schemas/
- pnpm build
```

## T005: Implement Schema Loader and Ajv Validators

```text
Plan roadmap task T005: Implement Schema Loader and Ajv Validators.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/validation/schemas.ts
- src/validation/validate.ts
- test/unit/validation/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Valid examples from specs pass.
- Invalid examples fail with stable issue codes.
- Validation does not mutate files.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/validation/
```

## T006: Implement Conflict Marker Detection

```text
Plan roadmap task T006: Implement Conflict Marker Detection.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/validation/conflicts.ts
- test/unit/validation/conflicts.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Conflict markers in JSON, JSONL, and Markdown are errors.
- Generated files are ignored.
- Line numbers are reported when available.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/validation/conflicts.test.ts
```

## T007: Implement Secret Detection

```text
Plan roadmap task T007: Implement Secret Detection.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md
- prd.md

Write scope:
- src/validation/secrets.ts
- test/unit/validation/secrets.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Block-level secret findings prevent writes.
- Warn-level findings are returned without blocking reads.
- Test output never includes the secret value.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/validation/secrets.test.ts
```

## T008: Implement Safe Filesystem Helpers

```text
Plan roadmap task T008: Implement Safe Filesystem Helpers.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md

Write scope:
- src/core/fs.ts
- test/unit/core/fs.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Attempts to write outside allowed roots fail.
- JSON output is deterministic.
- Markdown CRLF input normalizes to LF.
- JSONL append writes exactly one LF-terminated object.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/fs.test.ts
```

## T009: Implement Native Git Wrapper

```text
Plan roadmap task T009: Implement Native Git Wrapper.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- prd.md

Write scope:
- src/core/git.ts
- src/core/subprocess.ts
- test/unit/core/git.test.ts
- test/integration/git/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Outside Git returns a "Git unavailable" result without failing root resolution.
- Detached HEAD reports Git as available with `branch: null`, not `branch: "HEAD"`.
- Dirty-state ignores `.aictx/index/`, `.aictx/context/`, and `.aictx/.lock`.
- Diff only includes `.aictx/`.
- Tests verify no shell string execution path.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/git.test.ts test/integration/git/
```

## T010: Implement Project Root Resolution

```text
Plan roadmap task T010: Implement Project Root Resolution.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- src/core/paths.ts
- test/unit/core/paths.test.ts
- test/integration/paths/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Nested cwd inside a repo resolves to Git root.
- Nested cwd outside Git resolves by walking upward to the nearest `.aictx/config.json`.
- Non-Git `init` resolves to `cwd`.
- Missing `.aictx/` fails except for init.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/paths.test.ts test/integration/paths/
```

## T011: Implement Project Lock

```text
Plan roadmap task T011: Implement Project Lock.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md

Write scope:
- src/core/lock.ts
- test/unit/core/lock.test.ts
- test/integration/lock/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Concurrent lock acquisition fails deterministically.
- Lock file is removed on successful completion.
- Existing lock is not automatically removed.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/lock.test.ts test/integration/lock/
```

## T012: Implement ID and Slug Generation

```text
Plan roadmap task T012: Implement ID and Slug Generation.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/core/ids.ts
- test/unit/core/ids.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- ID generation matches storage and patch specs.
- Collision suffixes are deterministic.
- Invalid characters are removed or normalized predictably.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/ids.test.ts
```

## T013: Implement Markdown Helpers

```text
Plan roadmap task T013: Implement Markdown Helpers.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/storage/markdown.ts
- test/unit/storage/markdown.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- H1 extraction works.
- Frontmatter is detected.
- LF normalization is deterministic.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/markdown.test.ts
```

## T014: Implement Canonical JSON and Hashing

```text
Plan roadmap task T014: Implement Canonical JSON and Hashing.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md

Write scope:
- src/storage/hashes.ts
- test/unit/storage/hashes.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Hashes are reproducible across key order changes.
- CRLF and LF Markdown hash identically after normalization.
- Existing `content_hash` does not affect recomputation.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/hashes.test.ts
```

## T015: Implement Canonical Storage Reader

```text
Plan roadmap task T015: Implement Canonical Storage Reader.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/storage/read.ts
- src/storage/objects.ts
- src/storage/relations.ts
- src/storage/events.ts
- test/unit/storage/read.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Invalid JSON and JSONL are reported.
- Blank JSONL lines are errors.
- Events include 1-based line numbers.
- Generated directories are ignored.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/read.test.ts
```

## T016: Implement Cross-File Validation

```text
Plan roadmap task T016: Implement Cross-File Validation.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md

Write scope:
- src/validation/validate.ts
- test/unit/validation/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Cross-file validation catches all errors listed in `schemas-and-validation-spec.md`.
- Warnings and errors use stable shapes.
- Validation can run on an initialized sample `.aictx/`.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/validation/
```

## T017: Implement Event Builder and JSONL Append

```text
Plan roadmap task T017: Implement Event Builder and JSONL Append.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/storage/events.ts
- test/unit/storage/events.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Each write operation maps to the correct event type.
- Events are LF-terminated JSONL.
- Event examples validate.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/events.test.ts
```

## T018: Implement `aictx init` Storage Creation Service

```text
Plan roadmap task T018: Implement `aictx init` Storage Creation Service.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/storage/init.ts
- src/app/operations.ts
- test/integration/init/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Init creates valid storage.
- Init does not commit.
- Init outside Git succeeds in local mode.
- Re-running init on valid storage returns success with warning.
- Init response includes concise next steps for load, save, and diff.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/init/
```

## T019: Implement SQLite Connection and Migrations

```text
Plan roadmap task T019: Implement SQLite Connection and Migrations.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- src/index/sqlite.ts
- src/index/migrations.ts
- test/unit/index/sqlite.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Empty database migrates to schema version `1`.
- Required tables and indexes exist.
- Connection closes cleanly.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/index/sqlite.test.ts
```

## T020: Implement Full Index Rebuild

```text
Plan roadmap task T020: Implement Full Index Rebuild.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/index/rebuild.ts
- src/app/operations.ts
- test/integration/index/rebuild.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Rebuild indexes valid storage.
- Rebuild does not append events.
- Deleting `.aictx/index/` loses no memory.
- Invalid canonical files prevent replacing valid index.
- Init returns `index_built: true` when rebuild succeeds.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/index/rebuild.test.ts
```

## T021: Implement Incremental Index Update

```text
Plan roadmap task T021: Implement Incremental Index Update.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- storage-format-spec.md

Write scope:
- src/index/incremental.ts
- test/unit/index/incremental.test.ts
- test/integration/index/incremental.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Incremental update matches full rebuild result for touched changes.
- Failure after canonical write returns index warning, not failed save.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/index/incremental.test.ts test/integration/index/incremental.test.ts
```

## T022: Implement Search

```text
Plan roadmap task T022: Implement Search.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/index/search.ts
- src/app/operations.ts
- test/unit/index/search.test.ts
- test/integration/index/search.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Search does not require embeddings.
- Limit validation follows spec.
- Results expose status clearly.
- Ranking is deterministic.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/index/search.test.ts test/integration/index/search.test.ts
```

## T023: Implement Token Estimation

```text
Plan roadmap task T023: Implement Token Estimation.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- src/context/tokens.ts
- test/unit/context/tokens.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Omitted `token_budget` returns no token target.
- Explicit token budgets below minimum are rejected.
- Budgets above maximum are capped.
- Counting is deterministic.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/context/tokens.test.ts
```

## T024: Implement Ranking

```text
Plan roadmap task T024: Implement Ranking.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- storage-format-spec.md

Write scope:
- src/context/rank.ts
- test/unit/context/rank.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Same inputs produce same order.
- Rejected memory is excluded from default load output.
- Stale and superseded memory are not placed in `Must know` by default.
- Branch-scoped memory is included only when the current branch matches.
- Branch-scoped memory is excluded in detached HEAD state.
- Task-scoped memory is included only for strong task matches.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/context/rank.test.ts
```

## T025: Implement Context Pack Renderer

```text
Plan roadmap task T025: Implement Context Pack Renderer.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/context/render.ts
- test/unit/context/render.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Context pack is valid Markdown.
- Omitted `token_budget` renders selected memory without budget-driven truncation.
- Explicit token budgets never hide high-priority `Must know` or `Do not do` memory.
- Budget metadata is structured output, not Markdown context.
- Provenance is included.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/context/render.test.ts
```

## T026: Implement Context Compiler Service

```text
Plan roadmap task T026: Implement Context Compiler Service.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/context/compile.ts
- src/app/operations.ts
- test/integration/context/load.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- `loadMemory` works using only local files and SQLite FTS.
- `loadMemory` does not use config `defaultTokenBudget` as an implicit truncation target.
- `loadMemory` returns token target metadata, estimated tokens, budget status, truncated status, included IDs, excluded IDs, and omitted IDs.
- Missing index auto-rebuilds when enabled.
- No network access is required.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/context/load.test.ts
```

## T027: Implement Patch Validation Planner

```text
Plan roadmap task T027: Implement Patch Validation Planner.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md

Write scope:
- src/storage/patch.ts
- test/unit/storage/patch-planner.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Invalid patch fails before disk writes.
- Empty changes fail.
- Unknown operation fails.
- Dirty touched files fail with `AICtxDirtyMemory`.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/patch-planner.test.ts
```

## T028: Implement Relation Patch Operations

```text
Plan roadmap task T028: Implement Relation Patch Operations.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/storage/patch.ts
- src/storage/write.ts
- test/unit/storage/relation-patch.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Relation endpoint validation works.
- Duplicate equivalent relations are rejected.
- Relation event counts are correct.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/relation-patch.test.ts
```

## T029: Implement Object Patch Operations

```text
Plan roadmap task T029: Implement Object Patch Operations.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/storage/patch.ts
- src/storage/write.ts
- test/unit/storage/object-patch.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Object sidecars and Markdown bodies are correct.
- Status rules are enforced.
- Delete rejects active relation references.
- Supersede creates or preserves a `supersedes` relation.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/storage/object-patch.test.ts
```

## T030: Implement Save Application Service

```text
Plan roadmap task T030: Implement Save Application Service.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- src/app/operations.ts
- test/integration/save/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Successful save changes canonical files and index.
- Save rejects unresolved conflicts.
- Save rejects block-level secrets.
- When Git is available, save leaves Git changes uncommitted.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/save/
```

## T031: Implement CLI Main and Shared Rendering

```text
Plan roadmap task T031: Implement CLI Main and Shared Rendering.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/cli/main.ts
- src/cli/render.ts
- src/cli/exit.ts
- test/unit/cli/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Usage errors exit `2`.
- Git/storage precondition errors exit `3`.
- Validation and patch errors exit `1`.
- JSON mode prints only JSON to stdout.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/cli/
```

## T032: Implement `aictx init`

```text
Plan roadmap task T032: Implement `aictx init`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- src/cli/commands/init.ts
- test/integration/cli/init.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- `aictx init --json` returns success envelope.
- Human output is concise.
- Init outside Git returns a success envelope with `meta.git.available: false`.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/init.test.ts
```

## T033: Implement `aictx check` and `aictx rebuild`

```text
Plan roadmap task T033: Implement `aictx check` and `aictx rebuild`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- src/cli/commands/check.ts
- src/cli/commands/rebuild.ts
- src/app/operations.ts
- test/integration/cli/check-rebuild.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Invalid JSONL causes check failure.
- Rebuild recreates missing SQLite.
- Rebuild does not append events.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/check-rebuild.test.ts
```

## T034: Implement `aictx save`

```text
Plan roadmap task T034: Implement `aictx save`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md

Write scope:
- src/cli/commands/save.ts
- test/integration/cli/save.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- `save --stdin` and `save --file` use same write path.
- Invalid JSON exits `1`.
- Missing input source exits `2`.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/save.test.ts
```

## T035: Implement `aictx load` and `aictx search`

```text
Plan roadmap task T035: Implement `aictx load` and `aictx search`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- src/cli/commands/load.ts
- src/cli/commands/search.ts
- test/integration/cli/load-search.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- `aictx load` returns Markdown by default.
- `aictx load --json` returns envelope.
- `aictx load --json` includes token metadata and separate `excluded_ids` / `omitted_ids`.
- Search returns local SQLite FTS results.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/load-search.test.ts
```

## T036: Implement `aictx diff`

```text
Plan roadmap task T036: Implement `aictx diff`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/cli/commands/diff.ts
- src/app/operations.ts
- test/integration/cli/diff.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Diff excludes non-Aictx repository changes.
- Diff works when `.aictx/` is dirty.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/diff.test.ts
```

## T037: Implement Optional Read-Only CLI Commands

```text
Plan roadmap task T037: Implement Optional Read-Only CLI Commands.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- src/cli/commands/inspect.ts
- src/cli/commands/stale.ts
- src/cli/commands/graph.ts
- test/integration/cli/read-only.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Inspect shows one object plus direct relations.
- Stale lists stale and superseded memory.
- Graph returns relation neighborhood for debugging.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/read-only.test.ts
```

## T038: Implement `aictx history`

```text
Plan roadmap task T038: Implement `aictx history`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- src/cli/commands/history.ts
- src/app/operations.ts
- test/integration/cli/history.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- History excludes commits that only changed non-Aictx files.
- JSON shape matches API spec.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/history.test.ts
```

## T039: Implement Restore and Rewind Services

```text
Plan roadmap task T039: Implement Restore and Rewind Services.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- src/app/operations.ts
- src/storage/write.ts
- test/integration/restore/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Restore does not affect non-Aictx files.
- Dirty `.aictx/` blocks restore.
- Restore does not create a commit.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/restore/
```

## T040: Implement `aictx restore` and `aictx rewind`

```text
Plan roadmap task T040: Implement `aictx restore` and `aictx rewind`.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/cli/commands/restore.ts
- src/cli/commands/rewind.ts
- test/integration/cli/restore-rewind.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Restore requires commit argument.
- Rewind finds previous `.aictx/` commit.
- Both refuse dirty `.aictx/`.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/cli/restore-rewind.test.ts
```

## T041: Implement MCP Server Bootstrap

```text
Plan roadmap task T041: Implement MCP Server Bootstrap.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md

Important invariant:
- MCP is routine-agent-primary, not MCP-only.
- Keep MCP lean; do not expose CLI-only setup, maintenance, recovery, export, or inspection commands as MCP tools.
- Every other supported Aictx capability remains reachable to agents through the CLI.

Write scope:
- src/mcp/server.ts
- test/integration/mcp/server.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Server starts without writing to stdout outside MCP protocol.
- Server exposes no tools before registration task except bootstrap health if needed.
- Server does not expose arbitrary shell/filesystem tools or CLI-only Aictx commands.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/server.test.ts
```

## T042: Implement MCP Read Tools

```text
Plan roadmap task T042: Implement MCP Read Tools.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- indexing-and-context-compiler-spec.md

Important invariant:
- MCP read tools are limited to `load_memory`, `search_memory`, and `diff_memory`.
- Do not add CLI-only inspection, stale, graph, check, rebuild, history, restore, rewind, init, or export commands to MCP.

Write scope:
- src/mcp/tools/load-memory.ts
- src/mcp/tools/search-memory.ts
- src/mcp/tools/diff-memory.ts
- test/integration/mcp/read-tools.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- MCP load matches CLI load data.
- MCP load preserves CLI token metadata and omitted IDs.
- MCP search matches CLI search data.
- MCP diff matches CLI diff data.
- MCP does not expose read/debug/maintenance CLI commands beyond the normalized v1 tool set.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/read-tools.test.ts
```

## T043: Implement MCP Write Tool

```text
Plan roadmap task T043: Implement MCP Write Tool.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md

Important invariant:
- `save_memory_patch` is the only v1 MCP write tool.
- Do not add low-level graph mutation tools or CLI-only recovery/setup tools to MCP.

Write scope:
- src/mcp/tools/save-memory-patch.ts
- test/integration/mcp/save-tool.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- MCP save and CLI save produce equivalent canonical files.
- Concurrent MCP writes are serialized or return lock errors.
- Tool does not commit.
- MCP does not expose additional write, shell, filesystem, restore, rewind, or direct mutation tools.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/mcp/save-tool.test.ts
```

## T044: Add Golden Storage Fixtures

```text
Plan roadmap task T044: Add Golden Storage Fixtures.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- test/fixtures/
- test/integration/fixtures.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Fixtures validate or fail for expected reasons.
- Fixture hashes are deterministic.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/fixtures.test.ts
```

## T045: Add Full CLI Workflow Test

```text
Plan roadmap task T045: Add Full CLI Workflow Test.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- test/integration/e2e/cli-workflow.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Workflow passes without network.
- Git diff remains reviewable.
- Load without `token_budget` is not budget-truncated.
- Explicit `--token-budget` reports structured budget metadata.
- Restore only affects `.aictx/`.
- Non-Git core workflow passes without Git.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/e2e/cli-workflow.test.ts
```

## T046: Add Full MCP Workflow Test

```text
Plan roadmap task T046: Add Full MCP Workflow Test.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md

Important invariant:
- This test proves the routine MCP workflow, not complete CLI parity inside MCP.
- Full agent reachability is MCP plus CLI: do not add CLI-only commands to MCP to satisfy this task.

Write scope:
- test/integration/e2e/mcp-workflow.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- MCP tools use the same application services.
- MCP load without `token_budget` is not budget-truncated.
- MCP stdout is protocol-safe.
- No arbitrary shell or filesystem tools are exposed.
- MCP exposes exactly `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.
- CLI-only capabilities remain CLI-only and reachable through the `aictx` binary.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/e2e/mcp-workflow.test.ts
```

## T046B: Add Agent Capability Map Guardrail

```text
Plan roadmap task T046B: Add Agent Capability Map Guardrail.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- prd.md
- mcp-and-cli-api-spec.md
- integrations/templates/agent-guidance.md

Write scope:
- docs/mcp-and-cli-api-spec.md
- docs/runtime-and-project-architecture-spec.md
- docs/prd.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md
- prd.md
- integrations/templates/agent-guidance.md
- integrations/codex/aictx/SKILL.md
- integrations/claude/aictx.md
- integrations/generic/aictx-agent-instructions.md
- test/unit/agent-capability-map.test.ts

Do not modify:
- MCP server registration or MCP tools.
- CLI command behavior.
- Product/spec contracts beyond documenting the MCP-first, CLI-complete capability map.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Capability map to lock:
- MCP + CLI: load, search, save, diff.
- CLI-only in v1: init, check, rebuild, history, restore, rewind, inspect, stale, graph, export obsidian.

Acceptance:
- Docs do not imply CLI-only commands should be added to MCP for parity.
- Docs do not imply agents should edit `.aictx/` directly when a supported CLI command exists.
- Root-level spec mirrors match their `docs/` copies for touched specs.
- Generated guidance leads with MCP for routine memory work and clearly allows CLI fallback/advanced use.
- Test coverage locks the exact v1 MCP tool set and the CLI-only capability list.

Run:
- pnpm build:guidance
- pnpm typecheck
- pnpm vitest run test/unit/agent-capability-map.test.ts test/unit/scaffold.test.ts
- for f in mcp-and-cli-api-spec.md prd.md runtime-and-project-architecture-spec.md; do diff -q "$f" "docs/$f"; done
```

## T047: Add Security and Safety Regression Tests

```text
Plan roadmap task T047: Add Security and Safety Regression Tests.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- schemas-and-validation-spec.md
- storage-format-spec.md
- mcp-and-cli-api-spec.md
- prd.md

Write scope:
- test/integration/security/
- test/unit/security/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Safety regressions fail tests.
- MCP exposes only `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.
- CLI-only capabilities are not treated as MCP security exceptions.
- No test snapshot contains secret values.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/security/ test/unit/security/
```

## T048: Add Performance Smoke Tests

```text
Plan roadmap task T048: Add Performance Smoke Tests.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- indexing-and-context-compiler-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- test/integration/performance/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Tests are smoke tests, not strict benchmarks.
- Context-pack smoke coverage includes no token target and explicit advisory token target cases.
- Operations complete within reasonable local timeouts.
- No external services are used.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/performance/
```

## T049: Write README Quickstart

```text
Plan roadmap task T049: Write README Quickstart.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- prd.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- README.md

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- README reflects implemented commands.
- README explains that `--token-budget` is optional and advisory; omitted budgets do not truncate context.
- README explains MCP-first, CLI-complete agent capability: routine memory work through MCP, setup/maintenance/recovery/inspection/export through CLI.
- README does not imply MCP and CLI expose identical command lists.
- README does not promise deferred features.

Run:
- pnpm typecheck
- pnpm test
```

## T050: Add Agent Integration Guide and Generated Agent Guidance

```text
Plan roadmap task T050: Add Agent Integration Guide and Generated Agent Guidance.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- prd.md
- mcp-and-cli-api-spec.md

Write scope:
- docs/agent-integration.md
- integrations/templates/agent-guidance.md
- integrations/codex/aictx/SKILL.md
- integrations/claude/aictx.md
- integrations/generic/aictx-agent-instructions.md
- scripts/generate-agent-guidance.mjs
- package.json
- test/unit/agent-guidance/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Guide does not imply Aictx derives semantic memory from diffs.
- Guide does not imply CLI-only commands should be exposed as MCP tools.
- Guide does not mention embeddings as v1 behavior.
- Generated guidance tells agents to load memory before non-trivial work and save structured patches after meaningful changes.
- Generated guidance tells agents they may use the CLI for supported setup, maintenance, recovery, export, and inspection operations.
- Generated guidance tells agents not to edit `.aictx/` files directly or save secrets.
- Generated guidance remains optional and copyable.
- `pnpm build` regenerates guidance from the shared template.
- Tests fail if generated guidance drifts from the template.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/agent-guidance/
- pnpm build
```

## T051: Release Packaging Check

```text
Plan roadmap task T051: Release Packaging Check.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- package.json
- scripts/
- test/integration/release/

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- `aictx --help` works from packed package.
- `aictx-mcp` starts from packed package.
- Node engine is `>=22`.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/release/
- pnpm build
```

## T052: Add Obsidian Projection Export

```text
Plan roadmap task T052: Add Obsidian Projection Export.

Read these files first:
- implementation-roadmap.md
- prd.md
- storage-format-spec.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- schemas-and-validation-spec.md

Write scope:
- src/export/obsidian.ts
- src/app/operations.ts
- src/cli/main.ts
- src/cli/commands/export.ts
- src/core/errors.ts
- src/core/git.ts
- src/core/types.ts
- src/storage/init.ts
- test/unit/export/
- test/integration/cli/export-obsidian.test.ts
- test/integration/init/init.test.ts

Do not modify:
- MCP tools or MCP server registration.
- Canonical object, relation, event, config, or patch schemas.
- Canonical storage shape under `.aictx/memory/`, `.aictx/relations/`, or `.aictx/events.jsonl`.
- Context compiler, SQLite index, embeddings, file watching, Obsidian plugin code, or import/sync-from-Obsidian behavior.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- Default export writes to `.aictx/exports/obsidian/` and is gitignored by init.
- Custom `--out aictx-obsidian` works when the directory is empty or manifest-owned.
- Non-empty unmanifested output directory fails with `AICtxExportTargetInvalid`.
- Generated notes contain valid JSON frontmatter, preserved body content, aliases, tags, and active relation wikilinks.
- Stale manifest-owned files are removed; unmanifested files are preserved.
- Export does not mutate `.aictx/memory`, `.aictx/relations`, `.aictx/events.jsonl`, content hashes, or SQLite.
- `--json` returns `format`, `output_dir`, `manifest_path`, `objects_exported`, `relations_linked`, `files_written`, and `files_removed`.
- No network access, Obsidian installation, or Obsidian plugin is required.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/export/ test/integration/cli/export-obsidian.test.ts test/integration/init/init.test.ts
```

## T053: Add Direct Zod Dependency and MCP Registration Cleanup

```text
Plan roadmap task T053: Add Direct Zod Dependency and MCP Registration Cleanup.

Read these files first:
- implementation-roadmap.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- prd.md

Write scope:
- package.json
- pnpm-lock.yaml
- src/mcp/server.ts
- src/mcp/tools/load-memory.ts
- src/mcp/tools/search-memory.ts
- src/mcp/tools/save-memory-patch.ts
- src/mcp/tools/diff-memory.ts
- test/unit/mcp/
- test/integration/mcp/
- test/unit/agent-capability-map.test.ts

Do not modify:
- CLI command behavior or CLI response rendering.
- Application service validation, patch semantics, token-budget rules, project resolution, Git behavior, conflict checks, secret detection, storage validation, canonical schemas, or response contracts.
- MCP tool set beyond preserving exactly `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- `package.json` declares `zod` directly.
- Source code imports `zod` only as a direct dependency, not through MCP SDK internals.
- All four v1 MCP tools are registered through the SDK's high-level tool registration path.
- Zod schemas validate transport-level tool input shape only and do not duplicate product validation owned by shared services.
- MCP exposes only `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.
- Existing MCP workflow, read-tool, write-tool, and capability-map tests pass.
- No public CLI, MCP, storage, patch, or response contracts change.
- No network access, hosted service, embedding API, or cloud account is introduced.

Run:
- pnpm install
- pnpm typecheck
- pnpm vitest run test/integration/mcp/ test/unit/mcp/ test/unit/agent-capability-map.test.ts
```

## T054: Add Local Viewer Spec and Capability Docs

```text
Plan roadmap task T054: Add Local Viewer Spec and Capability Docs.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md
- prd.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- docs/agent-integration.md

Write scope:
- local-viewer-spec.md
- docs/local-viewer-spec.md
- prd.md
- docs/prd.md
- runtime-and-project-architecture-spec.md
- docs/runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md
- docs/mcp-and-cli-api-spec.md
- docs/agent-integration.md
- integrations/templates/agent-guidance.md
- integrations/codex/aictx/SKILL.md
- integrations/claude/aictx/SKILL.md
- integrations/claude/aictx.md
- integrations/generic/aictx-agent-instructions.md
- test/unit/agent-capability-map.test.ts

Do not modify:
- Viewer server, viewer UI, CLI command implementation, MCP server, canonical schemas, storage format, or patch behavior.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- Root specs and `docs/` mirrors are in sync.
- Capability guardrails include `aictx view` as CLI-only.
- Guidance generation remains template-derived.
- Specs clearly prohibit MCP exposure for `aictx view`.
- No implementation files for the server or UI are added in this task.

Run:
- pnpm build:guidance
- pnpm typecheck
- pnpm vitest run test/unit/agent-capability-map.test.ts
```

## T055: Add Viewer Build and Package Foundation

```text
Plan roadmap task T055: Add Viewer Build and Package Foundation.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md
- runtime-and-project-architecture-spec.md

Write scope:
- package.json
- pnpm-lock.yaml
- tsup.config.ts
- scripts/
- viewer/
- test/integration/release/

Do not modify:
- `aictx view` command registration or runtime server behavior.
- MCP tools or server registration.
- Canonical storage, schemas, patch behavior, or Obsidian export logic.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- `pnpm build` produces `dist/viewer/`.
- `pnpm pack` includes built viewer assets.
- Runtime serving will not require Vite or the Svelte compiler.
- No local server command or viewer API is implemented yet.

Run:
- pnpm install
- pnpm build
- pnpm typecheck
- pnpm vitest run test/integration/release/
```

## T056: Add `aictx view` Server and Local API

```text
Plan roadmap task T056: Add `aictx view` Server and Local API.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md
- runtime-and-project-architecture-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/cli/main.ts
- src/cli/commands/view.ts
- src/app/operations.ts
- src/viewer/
- test/unit/viewer/
- test/integration/cli/view.test.ts

Do not modify:
- MCP tools or MCP server registration.
- Viewer Svelte UI beyond static placeholder wiring required to prove serving.
- Canonical schemas, storage format, patch behavior, or context compiler behavior.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- Startup prints a usable local URL and keeps the process running.
- API requests without the token fail.
- Bootstrap reads canonical storage without mutating it.
- Export route uses the existing Obsidian projection service and writes generated files only.
- MCP tool registration is unchanged.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/viewer/ test/integration/cli/view.test.ts
```

## T057: Build Read-Only Viewer Shell

```text
Plan roadmap task T057: Build Read-Only Viewer Shell.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md
- runtime-and-project-architecture-spec.md

Write scope:
- viewer/
- test/integration/viewer/

Do not modify:
- Viewer server API contract except for spec-approved corrections.
- MCP tools, CLI command registration, canonical storage, schemas, or patch behavior.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- A user can search and inspect memory objects from the viewer.
- Markdown, JSON, and relation views render for the selected object.
- Raw HTML in memory does not execute.
- Browser smoke tests load the shell without console errors.

Run:
- pnpm build
- pnpm typecheck
- pnpm vitest run test/integration/viewer/
```

## T058: Add Selected-Node Graph Visualization

```text
Plan roadmap task T058: Add Selected-Node Graph Visualization.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md

Write scope:
- viewer/
- test/integration/viewer/

Do not modify:
- Viewer server API unless performance requires a spec-approved graph endpoint.
- MCP tools, CLI command registration, canonical storage, schemas, or patch behavior.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- The graph updates when selection changes.
- The graph contains only direct neighbors and direct relations.
- Empty relation neighborhoods render clearly.
- Browser tests verify the graph surface is nonblank for related objects.

Run:
- pnpm build
- pnpm typecheck
- pnpm vitest run test/integration/viewer/
```

## T059: Add Viewer Obsidian Export Action

```text
Plan roadmap task T059: Add Viewer Obsidian Export Action.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md
- mcp-and-cli-api-spec.md
- storage-format-spec.md

Write scope:
- viewer/
- src/viewer/
- test/integration/viewer/
- test/integration/cli/export-obsidian.test.ts

Do not modify:
- Obsidian export file format except for spec-approved fixes.
- Canonical schemas, storage format, patch behavior, or MCP tools.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- Export action regenerates the Obsidian projection.
- Canonical memory files, events, hashes, and SQLite are unchanged by export.
- Unsafe output directories fail with the existing export-target error.
- UI communicates export success, written files count, and manifest path.

Run:
- pnpm build
- pnpm typecheck
- pnpm vitest run test/integration/viewer/ test/integration/cli/export-obsidian.test.ts
```

## T060: Add Viewer Docs and End-to-End Verification

```text
Plan roadmap task T060: Add Viewer Docs and End-to-End Verification.

Read these files first:
- implementation-roadmap.md
- local-viewer-spec.md
- README.md
- docs/agent-integration.md

Write scope:
- README.md
- docs/agent-integration.md
- test/integration/cli/
- test/integration/release/
- test/integration/viewer/
- test/unit/agent-capability-map.test.ts

Do not modify:
- Product contracts unless the plan identifies a necessary spec correction.
- MCP tools, canonical storage, schemas, or patch behavior.
- Files outside the write scope unless the plan identifies a necessary spec correction.

Acceptance:
- README describes how to launch and use the viewer.
- Browser tests pass for the primary viewer workflow.
- Package tests prove viewer assets are present and serveable from the packed package.
- Capability guardrails still prove MCP exposes only `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.

Run:
- pnpm build
- pnpm typecheck
- pnpm vitest run test/integration/cli/ test/integration/release/ test/integration/viewer/ test/unit/agent-capability-map.test.ts
```

## T061: Spec Memory Discipline, Lifecycle Rules, and Taxonomy

```text
Plan roadmap task T061: Spec Memory Discipline, Lifecycle Rules, and Taxonomy.

Read these files first:
- implementation-roadmap.md
- prd.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- indexing-and-context-compiler-spec.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md

Write scope:
- Product/spec docs and docs mirrors
- README.md
- docs/agent-integration.md
- integrations/templates/agent-guidance.md
- generated integration guidance files
- test/unit/agent-capability-map.test.ts
- test/unit/agent-guidance/

Do not modify:
- Runtime source implementation files, except tests that guard docs/guidance contracts.
- MCP tool implementation.

Acceptance:
- Specs define memory discipline lifecycle rules.
- Specs add `gotcha` and `workflow`, and explicitly exclude `history` and `task-note` object types.
- Specs define load modes, CLI-only suggest, and CLI-only audit.
- Generated guidance is template-derived.
- MCP remains limited to `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`.

Run:
- pnpm build:guidance
- pnpm vitest run test/unit/agent-guidance test/unit/agent-capability-map.test.ts test/unit/scaffold.test.ts
```

## T062: Implement Schema and Storage Support for Gotcha and Workflow

```text
Plan roadmap task T062: Implement Schema and Storage Support for Gotcha and Workflow.

Read these files first:
- implementation-roadmap.md
- storage-format-spec.md
- schemas-and-validation-spec.md
- runtime-and-project-architecture-spec.md

Write scope:
- src/core/types.ts
- src/schemas/
- src/storage/
- src/validation/
- test/unit/core/
- test/unit/validation/
- test/integration/init/

Do not modify:
- Context ranking, CLI load mode behavior, suggest, or audit implementation.

Acceptance:
- Schema validation accepts `gotcha` and `workflow`.
- Save, load, search, check, export, and viewer summaries accept the new types.
- Existing types remain valid.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/core/ test/unit/validation/ test/integration/init/
```

## T063: Implement Mode-Aware Load Ranking and CLI Mode

```text
Plan roadmap task T063: Implement Mode-Aware Load Ranking and CLI Mode.

Read these files first:
- implementation-roadmap.md
- indexing-and-context-compiler-spec.md
- mcp-and-cli-api-spec.md

Write scope:
- src/cli/commands/load.ts
- src/mcp/tools/load-memory.ts
- src/context/
- src/index/
- test/unit/context/
- test/integration/context/
- test/integration/cli/load-search.test.ts
- test/integration/mcp/read-tools.test.ts

Do not modify:
- MCP tool list.
- Suggest or audit commands.

Acceptance:
- CLI `load --mode` and MCP `load_memory({ mode })` share core behavior.
- Modes rank/render different priorities deterministically.
- Invalid modes return validation errors.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/context/ test/integration/context/ test/integration/cli/load-search.test.ts test/integration/mcp/read-tools.test.ts
```

## T064: Add Aictx Suggest Review Packets

```text
Plan roadmap task T064: Add Aictx Suggest Review Packets.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md

Write scope:
- src/cli/commands/suggest.ts
- src/app/operations.ts
- src/discipline/
- src/core/git.ts
- test/unit/discipline/
- test/integration/cli/suggest.test.ts

Do not modify:
- MCP tool list.
- Audit implementation except shared discipline helpers.

Acceptance:
- `suggest --from-diff` is Git-required and read-only.
- `suggest --bootstrap` works outside Git and is read-only.
- Outputs include changed files, related memory, possible stale IDs, recommended memory types, and checklist.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/discipline/ test/integration/cli/suggest.test.ts
```

## T065: Add Deterministic Aictx Audit

```text
Plan roadmap task T065: Add Deterministic Aictx Audit.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- runtime-and-project-architecture-spec.md

Write scope:
- src/cli/commands/audit.ts
- src/app/operations.ts
- src/discipline/
- test/unit/discipline/
- test/integration/cli/audit.test.ts

Do not modify:
- MCP tool list.
- Canonical write path.

Acceptance:
- `aictx audit` reports deterministic findings.
- Findings include severity, rule, memory_id, message, and evidence.
- Audit does not write memory, events, indexes, exports, or Git state.

Run:
- pnpm typecheck
- pnpm vitest run test/unit/discipline/ test/integration/cli/audit.test.ts
```

## T066: Upgrade Autonomous Agent Guidance and Setup Docs

```text
Plan roadmap task T066: Upgrade Autonomous Agent Guidance and Setup Docs.

Read these files first:
- implementation-roadmap.md
- docs/agent-integration.md
- integrations/templates/agent-guidance.md
- README.md

Write scope:
- README.md
- docs/agent-integration.md
- integrations/templates/agent-guidance.md
- generated integration guidance files
- scripts/generate-agent-guidance.mjs
- test/unit/agent-guidance/
- test/unit/agent-capability-map.test.ts

Do not modify:
- Source implementation except guidance generation if required.

Acceptance:
- Guidance explains short linked memory, update-before-create, stale/supersede, and save-nothing-is-valid.
- Docs explain package-manager fallback when `aictx` is not on PATH.
- Generated guidance drift tests pass.

Run:
- pnpm build:guidance
- pnpm vitest run test/unit/agent-guidance/ test/unit/agent-capability-map.test.ts test/unit/scaffold.test.ts
```

## T067: Add End-to-End Memory Discipline Workflow Tests

```text
Plan roadmap task T067: Add End-to-End Memory Discipline Workflow Tests.

Read these files first:
- implementation-roadmap.md
- mcp-and-cli-api-spec.md
- indexing-and-context-compiler-spec.md

Write scope:
- test/integration/e2e/
- test/integration/cli/
- test/integration/mcp/
- test/integration/release/

Do not modify:
- Product source unless a tested bug is discovered and separately planned.

Acceptance:
- E2E tests cover bootstrap suggestion, gotcha/workflow saves, mode-aware load, diff suggestion, audit, stale/supersede, and final diff review.
- MCP remains limited to the four v1 tools.
- Non-Git core workflows still pass.

Run:
- pnpm typecheck
- pnpm vitest run test/integration/e2e/ test/integration/cli/ test/integration/mcp/ test/integration/release/
```
