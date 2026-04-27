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
- Stale lists stale, superseded, and rejected memory.
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

Write scope:
- src/mcp/server.ts
- test/integration/mcp/server.test.ts

Do not modify:
- Files outside the write scope unless the plan identifies a necessary spec correction.
- Product/spec contracts unless the task explicitly includes documentation or spec updates.

Acceptance:
- Server starts without writing to stdout outside MCP protocol.
- Server exposes no tools before registration task except bootstrap health if needed.

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

Run:
- pnpm typecheck
- pnpm vitest run test/integration/e2e/mcp-workflow.test.ts
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
- Guide does not mention embeddings as v1 behavior.
- Generated guidance tells agents to load memory before non-trivial work and save structured patches after meaningful changes.
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
