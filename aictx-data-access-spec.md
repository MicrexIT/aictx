# Aictx Data Access Spec

## 1. Purpose

This spec defines the host-neutral internal data-access contract beneath Aictx CLI commands and MCP tools.

The contract exists so local CLI, local MCP, and future host adapters can share behavior without duplicating storage, indexing, validation, or response semantics.

This spec does not define a hosted service, remote MCP, OAuth, tenancy, billing, embeddings, ChatGPT App SDK UI, or cloud sync.

## 2. Principles

* Canonical memory remains local under the resolved project `.aictx/` directory.
* CLI remains the default routine path for agents.
* Local MCP is a supported generic local-agent interface for harnesses that can launch `aictx-mcp`.
* CLI and MCP must share one data-access implementation for routine reads and structured writes.
* `save_memory_patch` remains the only MCP write primitive.
* Data access must not expose arbitrary filesystem reads, arbitrary filesystem writes, shell execution, or low-level graph mutation.
* Generated indexes, exports, and viewers are rebuildable and are not canonical storage.
* Future host adapters may rename operations at the adapter boundary, but must not fork core behavior.

## 3. Contract Surface

The shared data-access service must expose these operations:

```text
load(input): Promise<AppResult<LoadMemoryData>>
search(input): Promise<AppResult<SearchMemoryData>>
inspect(input): Promise<AppResult<InspectMemoryData>>
diff(input): Promise<AppResult<DiffMemoryData>>
applyPatch(input): Promise<AppResult<SaveMemoryData>>
```

Inputs must include a resolved or resolvable project target. Adapters may accept `cwd`, `project_root`, or a host-specific project selector, but the data-access boundary must resolve that selector to one project root and one `.aictx/` storage root before reading or writing.

Outputs must use the same success/error envelope semantics already used by CLI JSON and MCP structured content:

```text
ok
data | error
warnings
meta
```

## 4. Operation Semantics

`load` compiles task-specific context with the same ranking, mode, hints, token metadata, included IDs, excluded IDs, omitted IDs, and provenance as `aictx load` and `load_memory`.

`search` queries the local generated index with the same matching, hints, limits, snippets, paths, status, score, and index-unavailable behavior as `aictx search` and `search_memory`.

`inspect` reads one object by ID and returns the same object summary, Markdown body, metadata, incoming relation summaries, and outgoing relation summaries as `aictx inspect --json` and `inspect_memory`.

`diff` returns the same Git-backed `.aictx/` diff, changed files, untracked files, changed memory IDs, changed relation IDs, and `AICtxGitRequired` behavior as `aictx diff --json` and `diff_memory`.

`applyPatch` validates and applies a structured memory patch with the same safety, lock, repair, dirty backup, event append, index update, and result semantics as `aictx save --stdin` and `save_memory_patch`.

## 5. Adapter Profiles

Adapter profiles are static adapter-level mappings from host-visible tool or command names to shared data-access operations.
Only the local MCP profile is active by default in the current implementation.
Future generic or host-specific profiles remain inactive metadata unless an adapter explicitly selects them; defining a profile must not register tools, rename local MCP tools, or implement remote/cloud host behavior.

The local MCP adapter profile exposes exactly these tool names:

```text
load_memory
search_memory
inspect_memory
save_memory_patch
diff_memory
```

The CLI adapter profile exposes the matching routine commands:

```text
aictx load
aictx search
aictx inspect
aictx save
aictx diff
```

Future ChatGPT-compatible or other host profiles may map a generic `search` operation to the shared `search` data-access operation and a generic `fetch` operation to the shared `inspect` data-access operation. Those names are adapter-level aliases only. They must remain inactive unless explicitly selected and must not replace the local MCP tool names.

## 6. Write Boundary

Structured patch application is the only shared write operation in this contract.

Adapters must not add independent create/update/delete object tools, relation mutation tools, generated-index mutation tools, or direct file-write tools. Any future write adapter must still submit structured patches to `applyPatch`.

## 7. Tests

Data-access completion requires shared behavior tests proving CLI and MCP adapters produce equivalent envelopes for:

* Load with and without explicit token budgets.
* Search with and without hints.
* Inspect success and missing object errors.
* Diff inside and outside Git.
* Structured patch writes, including dirty touched-file backup behavior.
* Explicit project targeting from a globally launched local MCP server.
