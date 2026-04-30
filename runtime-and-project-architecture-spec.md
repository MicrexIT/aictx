# Aictx Runtime and Project Architecture Spec

## 1. Purpose

This document defines the v1 implementation architecture for Aictx.

It owns:

* Runtime and language choice
* Package manager and module format
* Repository/package layout
* Core module boundaries
* CLI and MCP process architecture
* Dependency choices
* File I/O, Git, SQLite, and validation integration
* Error handling and logging conventions
* Build, test, and release expectations

This spec depends on:

* `prd.md`
* `storage-format-spec.md`
* `mcp-and-cli-api-spec.md`
* `indexing-and-context-compiler-spec.md`
* `schemas-and-validation-spec.md`
* `local-viewer-spec.md`

This spec does not define:

* Storage schemas
* CLI command syntax
* MCP payload contracts
* SQLite schema details
* Ranking formula details
* Secret detection regexes
* Local viewer UX and browser API details

Those remain owned by the other specs.

## 2. Runtime Decision

V1 is a TypeScript Node.js application.

Required runtime:

```text
Language: TypeScript
Runtime: Node.js
Minimum Node version: 22
Module format: ESM
Package manager: pnpm
Primary package type: CLI + MCP server
Frontend: local read-only Svelte/Vite viewer served by the CLI in v1 extension
Hosted backend: none in v1
```

Rules:

* Aictx must run locally on the user's machine.
* Aictx must not require a cloud account, hosted service, or network access for core v1 commands.
* Aictx is initialized inside an existing project directory; it does not create or own a separate Git repository.
* CLI and MCP must share the same core implementation.
* CLI and MCP must not fork separate business logic paths.
* When Git is available, the app must use the native `git` binary rather than reimplementing Git.
* The app must use local SQLite for generated indexes.
* The app must not require embeddings or external model APIs.
* The local viewer must bind only to loopback and must not introduce a hosted backend.

## 3. Package Shape

V1 should start as a single package, not a monorepo.

Reasoning:

* V1 has one runtime target.
* The CLI and MCP server are thin adapters over the same core.
* A monorepo adds coordination overhead before there are separate packages to publish.

Repository layout:

```text
/
  package.json
  pnpm-lock.yaml
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  README.md
  LICENSE
  scripts/
    copy-schemas.mjs
    generate-agent-guidance.mjs
  docs/
    prd.md
    storage-format-spec.md
    mcp-and-cli-api-spec.md
    indexing-and-context-compiler-spec.md
    schemas-and-validation-spec.md
    runtime-and-project-architecture-spec.md
    local-viewer-spec.md
    implementation-roadmap.md
    agent-integration.md
  integrations/
    templates/
      agent-guidance.md
    codex/
      aictx/
        SKILL.md
    claude/
      aictx.md
    generic/
      aictx-agent-instructions.md
  src/
    cli/
      main.ts
      commands/
        init.ts
        load.ts
        save.ts
        diff.ts
        check.ts
        rebuild.ts
        history.ts
        restore.ts
        rewind.ts
        search.ts
        inspect.ts
        stale.ts
        graph.ts
        export.ts
    mcp/
      server.ts
      tools/
        load-memory.ts
        search-memory.ts
        save-memory-patch.ts
        diff-memory.ts
    app/
      operations.ts
    core/
      config.ts
      errors.ts
      result.ts
      paths.ts
      clock.ts
      ids.ts
      fs.ts
      git.ts
      logger.ts
    storage/
      init.ts
      read.ts
      write.ts
      patch.ts
      events.ts
      hashes.ts
      markdown.ts
      relations.ts
      objects.ts
    validation/
      schemas.ts
      validate.ts
      secrets.ts
      conflicts.ts
    index/
      sqlite.ts
      migrations.ts
      rebuild.ts
      incremental.ts
      search.ts
    context/
      compile.ts
      rank.ts
      render.ts
      tokens.ts
    export/
      obsidian.ts
    viewer/
      server.ts
      api.ts
    schemas/
      config.schema.json
      object.schema.json
      relation.schema.json
      event.schema.json
      patch.schema.json
    generated/
      version.ts
  viewer/
    package files and Svelte/Vite source
  test/
    fixtures/
    unit/
    integration/
```

Packaging rules:

* `src/schemas/*.schema.json` are the source copies used by `aictx init`.
* `aictx init` copies schema files into `.aictx/schema/`.
* Runtime validation reads project-local `.aictx/schema/` files.
* Tests may also validate bundled `src/schemas/` against examples.
* `integrations/templates/agent-guidance.md` is the canonical source for agent guidance text.
* `scripts/generate-agent-guidance.mjs` generates target-specific guidance files from the canonical template.
* Generated guidance files must not be edited directly.
* `integrations/codex/aictx/SKILL.md`, `integrations/claude/aictx/SKILL.md`, `integrations/claude/aictx.md`, and `integrations/generic/aictx-agent-instructions.md` are packaged as optional agent guidance.
* Specs may live at repo root during planning, but the implementation repo should place them under `docs/`.

## 4. Public Entry Points

The package exposes two executable entry points.

`package.json` bin entries:

```json
{
  "bin": {
    "aictx": "./dist/cli/main.js",
    "aictx-mcp": "./dist/mcp/server.js"
  }
}
```

Rules:

* `aictx` is the user CLI.
* `aictx-mcp` starts the MCP stdio server.
* Both entry points call shared application services.
* Neither entry point should import from the other's adapter layer.

Allowed import direction:

```text
cli/*      -> app/*, core/*
mcp/*      -> app/*, core/*
viewer/*   -> app/*, core/*
app/*      -> core/*, storage/*, validation/*, index/*, context/*, export/*
context/*  -> index/*, storage/*, core/*
index/*    -> storage/*, validation/*, core/*
export/*   -> storage/*, validation/*, core/*
storage/*  -> validation/*, core/*
validation/* -> core/*
core/*     -> no Aictx modules outside core
```

Forbidden import direction:

```text
core/* -> cli/*
core/* -> mcp/*
core/* -> app/*
app/* -> cli/*
app/* -> mcp/*
storage/* -> cli/*
storage/* -> mcp/*
index/* -> cli/*
index/* -> mcp/*
context/* -> cli/*
context/* -> mcp/*
export/* -> cli/*
export/* -> mcp/*
export/* -> app/*
cli/* -> mcp/*
mcp/* -> cli/*
```

## 5. Dependency Choices

V1 should keep dependencies small and boring.

Required `package.json` baseline:

```json
{
  "name": "@aictx/memory",
  "version": "0.1.4",
  "type": "module",
  "publishConfig": {
    "access": "public"
  },
  "engines": {
    "node": ">=22"
  },
  "bin": {
    "aictx": "dist/cli/main.js",
    "aictx-mcp": "dist/mcp/server.js"
  },
  "files": [
    "dist",
    "docs",
    "integrations",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "pnpm build:guidance && pnpm build:version && pnpm build:code && pnpm build:schemas && pnpm build:viewer",
    "build:code": "tsup",
    "build:schemas": "node scripts/copy-schemas.mjs",
    "build:version": "node scripts/generate-version.mjs",
    "build:viewer": "vite build --config viewer/vite.config.ts",
    "build:guidance": "node scripts/generate-agent-guidance.mjs",
    "dev": "tsx src/cli/main.ts",
    "dev:mcp": "tsx src/mcp/server.ts",
    "test": "vitest run",
    "test:local": "pnpm typecheck && pnpm test:package",
    "test:package": "vitest run test/integration/release/packaging.test.ts",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit && svelte-check --tsconfig viewer/tsconfig.json"
  }
}
```

Required runtime dependencies:

```text
@modelcontextprotocol/sdk
@sqlite.org/sqlite-wasm
ajv
commander
fast-glob
zod
```

Required development dependencies:

```text
@sveltejs/vite-plugin-svelte
@types/node
playwright
svelte
svelte-check
typescript
tsup
tsx
vite
vitest
```

Dependency roles:

* `commander` owns CLI parsing only.
* `@modelcontextprotocol/sdk` owns MCP transport and tool registration only.
* `@sqlite.org/sqlite-wasm` owns local SQLite access through the project driver.
* `ajv` owns JSON Schema Draft 2020-12 validation.
* `fast-glob` owns deterministic discovery of `.aictx/` canonical files.
* `zod` owns MCP and API boundary validation.
* Svelte and Vite own the local viewer build.
* TypeScript owns static types.
* `tsup` builds distributable ESM JavaScript.
* `vitest` runs unit and integration tests.

Rules:

* Do not add a web framework in v1.
* Do not add an ORM in v1.
* Do not add a Git abstraction library in v1.
* Do not add an embeddings library in v1.
* Do not add a general logging framework unless the simple internal logger is insufficient.
* New runtime dependencies require a clear reason in the implementation task that adds them.

## 6. TypeScript Configuration

Required TypeScript posture:

```text
strict: true
noUncheckedIndexedAccess: true
exactOptionalPropertyTypes: true
module: NodeNext
moduleResolution: NodeNext
target: ES2022
declaration: true
sourceMap: true
```

Required `tsconfig.json` baseline:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist-types"
  },
  "include": ["src/**/*.ts", "src/**/*.json", "test/**/*.ts"]
}
```

Rules:

* Source files use `.ts`.
* Runtime imports must include file extensions after build where required by Node ESM.
* Avoid `any` in core, storage, validation, index, and context modules.
* `unknown` is allowed at JSON boundaries and must be narrowed before use.
* JSON Schema validation does not replace TypeScript domain types; both are required.
* Public core functions must return typed results, not raw thrown errors.

## 7. Core Domain Types

The implementation should define domain types that mirror the schema specs.

Minimum core types:

```text
AictxPaths
GitState
AictxMeta
Result<T>
AictxError
ValidationIssue
ValidationResult
MemoryObject
MemoryRelation
MemoryEvent
MemoryPatch
PatchChange
SearchResult
ContextPack
SuggestPacket
AuditFinding
```

`GitState` must include:

```text
available: boolean
branch: string | null
commit: string | null
dirty: boolean | null
```

When `available` is `false`, `branch`, `commit`, and `dirty` must be `null`.

When `available` is `true` and Git is in detached HEAD state, `branch` must be `null` and `commit` must still be populated.

Rules:

* Schema-derived types and runtime schemas must stay aligned.
* Manual TypeScript types are acceptable in v1.
* Generated types from JSON Schema may be added later, but are not required.
* Domain types should use exact string unions for object types, statuses, predicates, events, actors, scope kinds, and patch ops.
* File paths in domain types should be project-root-relative unless absolute paths are explicitly required.

## 8. Application Service

`src/app/operations.ts` owns the high-level application operations.

Required service functions:

```text
initProject(input): Promise<Result<InitData>>
loadMemory(input): Promise<Result<LoadData>>
searchMemory(input): Promise<Result<SearchData>>
saveMemoryPatch(input): Promise<Result<SaveData>>
diffMemory(input): Promise<Result<DiffData>>
suggestMemory(input): Promise<Result<SuggestData>>
auditMemory(input): Promise<Result<AuditData>>
checkProject(input): Promise<Result<CheckData>>
rebuildIndex(input): Promise<Result<RebuildData>>
history(input): Promise<Result<HistoryData>>
restore(input): Promise<Result<RestoreData>>
rewind(input): Promise<Result<RestoreData>>
```

Rules:

* CLI commands should do parsing, call one application service function, render output, and set exit code.
* MCP tools should validate tool input, call one application service function, and return the shared response envelope.
* Application services must not print to stdout.
* Application services must not call `process.exit`.
* Application services must not assume they are running from the user's current directory; they receive or resolve a cwd explicitly.

## 9. Project Root Resolution

`src/core/paths.ts` owns root resolution.

V1 project root resolution must support Git and non-Git projects.

Git is preferred when available because it provides diff, review, history, and restore behavior. Non-Git projects still support core memory operations.

Algorithm:

1. Start from `cwd`.
2. Run `git rev-parse --show-toplevel`.
3. If Git root detection succeeds, resolve `projectRoot` to the Git worktree root.
4. If Git root detection fails and the command is `init`, resolve `projectRoot` to `cwd`.
5. If Git root detection fails and the command is not `init`, walk upward from `cwd` for the nearest `.aictx/config.json`; its parent directory is `projectRoot`.
6. Resolve `aictxRoot` to `<projectRoot>/.aictx`.
7. For commands other than `init`, require `.aictx/` to exist.

Rules:

* Use the native `git` binary through `src/core/git.ts`.
* Do not walk parent directories manually looking for `.git`.
* In non-Git mode, walk only for `.aictx/config.json`.
* Do not allow `AICtx` roots outside the resolved project root.
* Path normalization must prevent writes outside `.aictx/`.

## 10. Git Integration

`src/core/git.ts` owns all Git interaction.

Allowed Git commands:

```text
git rev-parse --show-toplevel
git symbolic-ref --short -q HEAD
git rev-parse HEAD
git status --porcelain=v1 -- .aictx
git diff -- .aictx
git log --format=... -- .aictx
git show <commit>:.aictx/<path>
git restore --source <commit> -- .aictx
```

Rules:

* Aictx must never run `git commit`.
* Aictx must never run `git reset --hard`.
* Aictx must never restore paths outside `.aictx/`.
* Dirty-state checks must ignore generated/local `.aictx/index/`, `.aictx/context/`, and `.aictx/.lock`.
* Git command arguments must be passed as argv arrays, never shell-concatenated strings.
* Git failures must map to `AICtxGitOperationFailed` unless a more specific error applies.
* Git-only services must return `AICtxGitRequired` when no Git worktree is available.
* Detached HEAD is valid Git availability but has no current branch scope match.

## 11. File I/O Rules

`src/core/fs.ts` owns safe file helpers.

Rules:

* All text files are UTF-8.
* Invalid UTF-8 is a validation error.
* Canonical writes must be atomic where practical.
* Atomic write pattern: write temp file in same directory, fsync where practical, then rename.
* JSON output must be deterministic with two-space indentation for canonical files.
* Markdown writes must normalize line endings to LF.
* JSONL appends must append exactly one LF-terminated JSON object per event.
* Never write outside `.aictx/` except for optional `.gitignore` update during `init` when Git is available, and explicit projection exports to a user-selected `--out` path inside the project root.
* Generated index writes are restricted to `.aictx/index/`.
* Generated context writes are restricted to `.aictx/context/`.
* Default generated export writes are restricted to `.aictx/exports/`.
* Custom projection export writes must stay inside the project root and must refuse unsafe or unowned output directories.

## 12. Storage Module Responsibilities

`src/storage/*` owns canonical file operations.

Responsibilities:

* Initialize `.aictx/` layout.
* Read memory object sidecars and Markdown bodies.
* Read relation files.
* Read and append events.
* Apply structured patches.
* Generate IDs and file paths for new objects and relations.
* Compute and update content hashes.
* Produce changed-file summaries for responses.

Rules:

* Patch application must be all-or-nothing for canonical files.
* The full patch must validate before writes begin.
* Writes should use a staging plan before touching disk.
* If a write fails midway, return a clear error and do not claim success.
* Generated index updates happen after canonical writes.
* Failed index updates after successful canonical writes return warnings, not a failed save.

## 13. Validation Module Responsibilities

`src/validation/*` owns validation.

Responsibilities:

* Load project-local JSON Schemas.
* Compile schemas with Ajv Draft 2020-12.
* Validate config, objects, relations, events, and patches.
* Run cross-file validation.
* Detect Git conflict markers.
* Run secret detection.
* Return validation issues with stable codes.

Rules:

* Validation must not mutate canonical files.
* `check` must use the same validators as `save`.
* Schema validation failures map to `AICtxSchemaValidationFailed`.
* Cross-file validation failures map to `AICtxValidationFailed` unless a more specific error exists.
* Secret block findings map to `AICtxSecretDetected`.
* Conflict marker findings map to `AICtxConflictDetected`.

## 14. Index Module Responsibilities

`src/index/*` owns generated SQLite index operations.

Responsibilities:

* Open `.aictx/index/aictx.sqlite`.
* Create schema version `1`.
* Rebuild index from canonical files.
* Apply incremental updates after saves.
* Search memory using SQLite FTS.
* Detect unavailable or stale index states where practical.

Rules:

* Index rebuild must not mutate canonical files.
* Index rebuild must not append `index.rebuilt` in v1.
* If rebuild fails, preserve the previous valid SQLite database where practical.
* SQLite writes should use transactions.
* SQLite connections must be closed after command completion.
* MCP server requests must not share mutable SQLite statements across concurrent tool calls.

## 15. Context Module Responsibilities

`src/context/*` owns context pack generation.

Responsibilities:

* Normalize task input.
* Validate and apply load modes: `coding`, `debugging`, `review`, `architecture`, and `onboarding`.
* Retrieve candidate memory through the index module.
* Rank candidates according to `indexing-and-context-compiler-spec.md`.
* Apply precision-first token target packaging when explicitly requested.
* Render Markdown context packs.
* Optionally save generated context packs when config allows.

Rules:

* Context compilation must not mutate canonical files.
* Load modes must tune deterministic ranking and rendering only.
* Saved context packs are generated files unless config says they are tracked.
* The context module must not call Git directly except through core metadata passed into it.
* Ranking logic must be deterministic for the same inputs.

## 16. Memory Discipline Module Responsibilities

`src/discipline/*` owns deterministic memory discipline helpers.

Memory discipline is policy plus deterministic packets. The lifecycle rules are:

* Load narrowly before non-trivial work using the task and load mode.
* Save only durable knowledge and keep entries short, linked, and reviewable.
* Prefer updating existing memory, marking it stale, or superseding it before creating duplicates.
* Prefer current code, tests, manifests, and user instruction over loaded memory when they conflict.
* Review memory diffs after meaningful work.
* Save nothing when no durable future value was discovered.

Responsibilities:

* Build `aictx suggest --from-diff` review packets from Git diff summaries, changed files, related memory, and possible stale candidates.
* Build `aictx suggest --bootstrap` review packets from local project files that are useful for first-run memory creation.
* Build `aictx audit` findings for deterministic memory hygiene rules.
* Keep suggestion and audit outputs read-only and local-only.
* Return stable JSON shapes suitable for agents.

Rules:

* The discipline module must not call a model, embeddings service, network API, or hosted service.
* The discipline module must not create or edit memory patches.
* The discipline module must not mutate canonical files, generated indexes, events, exports, or Git state.
* Agents use discipline outputs as evidence and draft structured patches through `save_memory_patch` or `aictx save`.

## 17. Projection Export Module Responsibilities

`src/export/*` owns generated projections for external viewers.

Responsibilities:

* Generate a one-way Obsidian-compatible Markdown projection from canonical storage.
* Default output to `.aictx/exports/obsidian/`.
* Support explicit `--out <dir>` targets resolved inside the project root.
* Write generated notes, a root index note, and an export manifest.
* Remove only stale files listed in the previous export manifest.

Rules:

* Projection exports must not mutate canonical files, append events, update hashes, rebuild SQLite, or read generated exports as source data.
* Obsidian JSON frontmatter is allowed only in generated projection files, never canonical memory bodies.
* The export module must reject project root, canonical `.aictx` directories, symlinks, paths outside the project root, invalid manifests, and non-empty unmanifested directories.
* The export module must not import from CLI, MCP, or app adapters.

## 18. CLI Architecture

`src/cli/main.ts` owns process startup for the CLI.

Rules:

* CLI parsing is adapter logic only.
* CLI commands must call application service functions.
* CLI default output is human-readable.
* CLI `--json` output must use the shared response envelope from `mcp-and-cli-api-spec.md`.
* CLI must write normal output to stdout.
* CLI must write diagnostics and human-readable errors to stderr.
* CLI must set exit codes exactly as specified in `mcp-and-cli-api-spec.md`.
* CLI must not perform long-running background work after printing success.

Command module pattern:

```text
parse argv -> build service input -> call application service -> render result -> set exit code
```

## 19. MCP Architecture

`src/mcp/server.ts` owns MCP startup.

Transport:

```text
stdio
```

Required tools:

```text
load_memory
search_memory
save_memory_patch
diff_memory
```

Agent capability split:

```text
MCP + CLI: load, search, save, diff
CLI-only in v1: init, check, rebuild, history, restore, rewind, inspect, stale, graph, export obsidian, view, suggest, audit
```

Rules:

* MCP must expose only the normalized v1 tool set.
* CLI-only capabilities are intentionally not MCP parity gaps and must not be added to MCP solely to mirror CLI commands.
* MCP must not expose arbitrary shell access.
* MCP must not expose arbitrary filesystem access.
* MCP must not expose low-level graph mutation tools.
* MCP tool handlers must call application service functions.
* MCP responses must use the shared response envelope.
* Tool input validation should happen before service execution.
* Write tools must serialize per project root to avoid concurrent writes to `.aictx/`.
* Agents may use the CLI for Aictx capabilities that are intentionally not in the MCP tool set.
* CLI commands used by agents must continue to call application services and support stable `--json` output where structured automation is expected.
* Agents should use supported MCP or CLI entrypoints instead of editing `.aictx/` files directly when a supported command exists.

Project resolution:

* MCP tools resolve projects from optional `project_root` input when provided.
* When `project_root` is omitted, MCP tools resolve projects from the server process `cwd` for backward compatibility.
* `project_root` must be treated only as a project selection input; the storage boundary remains the resolved `<projectRoot>/.aictx` directory.
* MCP tools must not accept `aictxRoot`, arbitrary filesystem root, or low-level file path parameters.
* Users may configure one globally installed MCP server instance and target multiple initialized projects by passing `project_root` per tool call.
* Project memory remains isolated by default; cross-project or shared memory behavior requires an explicit future design and must not happen implicitly.

Concurrency rule:

```text
For a given projectRoot, only one write operation may run at a time.
Read operations may run concurrently unless an index rebuild is in progress.
```

## 20. Write Locking

Aictx must guard canonical writes against concurrent local processes.

Lock file:

```text
.aictx/.lock
```

Rules:

* Save, restore, rewind, init, and rebuild acquire a project lock.
* For `init`, create `.aictx/` first when missing, then immediately acquire `.aictx/.lock` before writing other files.
* Read commands do not require the lock unless they trigger auto-rebuild.
* Lock acquisition uses exclusive file creation for `.aictx/.lock`.
* Lock file creation must use an atomic create-new operation equivalent to Node `fs.open(path, "wx")`.
* The lock file payload should contain `pid`, `created_at`, and `operation`.
* If the lock is held, return `AICtxLockBusy`.
* V1 must not automatically remove an existing lock file.
* If a lock file is older than 1 hour, include a stale-lock warning in error details.
* The lock file is not canonical and must not be tracked when Git is available.

Required `.gitignore` addition when Git is available:

```gitignore
.aictx/.lock
```

API requirement:

* Lock contention returns `AICtxLockBusy`.

## 21. Error Model

Application services return `Result<T>`.

Shape:

```ts
type Result<T> =
  | { ok: true; data: T; warnings: ValidationIssue[]; meta: AictxMeta }
  | { ok: false; error: AictxError; warnings: ValidationIssue[]; meta: AictxMeta };
```

Rules:

* Expected user-correctable failures return `Result` errors.
* Unexpected programmer errors may throw, but entry points must catch them.
* Entry points convert uncaught errors to `AICtxInternalError`.
* Error codes must be stable.
* Error messages should be human-readable and actionable.
* Error details must not include secret values.

API requirement:

* Uncaught entry-point failures return `AICtxInternalError`.

## 22. Logging

Logging must be quiet by default.

Rules:

* Successful CLI commands print only command output.
* `--json` mode prints only JSON to stdout.
* MCP server must not write logs to stdout because stdout is transport.
* MCP diagnostics must go to stderr.
* Debug logging is enabled by `AICTX_DEBUG=1`.
* Logs must not print secret values.
* Logs should include project root and operation name when useful.

## 23. Build Output

Build command:

```bash
pnpm build
```

Required build outputs:

```text
dist/
  cli/main.js
  mcp/server.js
  schemas/
    config.schema.json
    object.schema.json
    relation.schema.json
    event.schema.json
    patch.schema.json
```

Rules:

* Build output must be ESM.
* Executable entry files must include a Node shebang.
* Schema JSON files must be copied into `dist/schemas/`.
* `scripts/copy-schemas.mjs` copies `src/schemas/*.schema.json` to `dist/schemas/`.
* `scripts/generate-agent-guidance.mjs` rewrites generated files under `integrations/` from `integrations/templates/agent-guidance.md`.
* `pnpm build` must run `build:guidance` before packaging so generated agent guidance cannot drift from the template.
* Source maps should be emitted.
* Type declarations should be emitted for core modules if practical.

Required `tsup.config.ts` baseline:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli/main": "src/cli/main.ts",
    "mcp/server": "src/mcp/server.ts"
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  shims: false
});
```

Required `scripts/copy-schemas.mjs` baseline:

```js
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const sourceDir = "src/schemas";
const targetDir = "dist/schemas";

await mkdir(targetDir, { recursive: true });

for (const file of await readdir(sourceDir)) {
  if (file.endsWith(".schema.json")) {
    await copyFile(join(sourceDir, file), join(targetDir, file));
  }
}
```

Required `scripts/generate-agent-guidance.mjs` behavior:

```text
Input:
  integrations/templates/agent-guidance.md

Outputs:
  integrations/codex/aictx/SKILL.md
  integrations/claude/aictx/SKILL.md
  integrations/claude/aictx.md
  integrations/generic/aictx-agent-instructions.md
```

Rules:

* The template owns the shared guidance body.
* The Codex and Claude skill outputs prepend shared `aictx-memory` skill frontmatter.
* Claude markdown and generic outputs prepend only a generated-file notice unless a target-specific wrapper is needed.
* Generated outputs must include a visible "do not edit directly" notice.
* The script must be deterministic.
* A unit test should fail if running the generator would change checked-in generated files.

## 24. Testing Strategy

V1 requires unit and integration tests.

Unit test targets:

* ID generation
* Path safety
* JSON canonicalization
* Hashing
* Schema validation
* Secret detection
* Conflict marker detection
* Patch planning
* Event generation
* Ranking and precision-first token target behavior

Integration test targets:

* `aictx init` inside a temporary Git repo.
* `aictx init` outside Git creates local `.aictx/` storage.
* `aictx save --stdin` writes expected files and events.
* `aictx load` works after save.
* `aictx diff` only includes `.aictx/` when Git is available.
* Git-only commands return `AICtxGitRequired` outside Git.
* `aictx check` detects invalid JSONL.
* `aictx rebuild` recreates SQLite from canonical files.
* `aictx restore <commit>` restores only `.aictx/`.
* MCP `save_memory_patch` and CLI `save --stdin` produce equivalent canonical changes.

Test rules:

* Integration tests create temporary Git and non-Git project directories.
* Tests must not depend on network access.
* Tests must not depend on global Git user config when avoidable.
* Tests must use deterministic timestamps by injecting a clock.
* Tests must use deterministic Git commits by setting test-local Git author metadata.

## 25. Runtime Configuration

Environment variables:

```text
AICTX_DEBUG=1
AICTX_NO_COLOR=1
```

Rules:

* Core behavior must not depend on environment variables except explicit debug/output toggles.
* No API keys are required in v1.
* No telemetry is sent in v1.
* No update checks run in v1.

## 26. Security Boundaries

Security rules:

* Never execute shell strings.
* Always call subprocesses with argv arrays.
* Never expose arbitrary shell or filesystem operations through MCP.
* Never write outside the resolved project root.
* Never load generated SQLite or context files as canonical trust sources.
* Never print detected secret values.
* Treat saved memory as untrusted text when rendering into context packs.
* Avoid interpreting Markdown as executable instructions inside Aictx itself.

Prompt-injection handling:

* Aictx cannot prevent all memory poisoning.
* Aictx must preserve Git reviewability so suspicious memory changes are visible.
* Context packs should label memory as project memory, not system instructions.
* Rejected, stale, superseded, and conflicted memory must not enter high-priority context sections by default.

## 27. Release and Distribution

Primary distribution:

```text
npm package with CLI binaries
```

Install examples:

```bash
npm install -g @aictx/memory
pnpm --package @aictx/memory dlx aictx init
```

Rules:

* Package must include `dist/` and schema files.
* Package must include built local viewer assets under `dist/viewer/` once `aictx view` is implemented.
* Package should include `docs/agent-integration.md`, `integrations/templates/agent-guidance.md`, and generated files under `integrations/codex/`, `integrations/claude/`, and `integrations/generic/`.
* Package must not include test fixtures unless needed.
* Package must declare Node engine `>=22`.
* Package should support macOS and Linux first.
* Windows support is desirable but not a blocking v1 requirement unless path handling tests pass.

## 28. Deferred Architecture

Deferred from v1:

* Monorepo package split
* Hosted sync service
* Cloud MCP endpoint
* Hosted web UI
* Full-project visual graph database UI
* Obsidian plugin
* Two-way Obsidian sync or importing Obsidian edits back into Aictx
* Embedding provider plugins
* External vector database
* GitHub/GitLab app
* Team governance service
* Background daemon
* File watcher
* Telemetry pipeline

Allowed extension points:

* Add a future `packages/core` split if external integrations need a library.
* Add optional embedding modules behind an interface without changing v1 FTS behavior.
* Add hosted sync behind explicit user configuration.
* Add team workflow tools without changing the local canonical storage contract.

## 29. Acceptance Criteria

Runtime architecture is implementation-ready when:

* A new coding agent can create `package.json`, `tsconfig.json`, and source directories from this spec without choosing a different stack.
* The project builds with TypeScript on Node.js 22.
* `aictx` and `aictx-mcp` are separate binaries over shared application services.
* CLI and MCP call the same save/load/search/diff implementation.
* Native Git is used for worktree, diff, history, and restore behavior when Git is available.
* SQLite is local generated state and is accessed only through the index module.
* JSON Schema validation uses project-local `.aictx/schema/` files.
* Obsidian projection exports are generated state and never canonical input.
* `aictx view` serves only a loopback local read-only viewer and does not mutate canonical memory.
* No command requires network access, embeddings, API keys, or a cloud account.
* Writes are protected by a local project lock.
* Tests can exercise the main flows in temporary Git and non-Git project directories.
