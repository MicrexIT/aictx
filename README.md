# Aictx

Aictx is local-first project memory for AI coding agents.

It gives agents a durable place to store project facts, decisions, warnings,
workflows, source records, and syntheses that should survive beyond a single
chat. Memory is stored under `.aictx/` as reviewable local files, indexed
locally for fast retrieval, and kept compatible with Git workflows.

```text
load relevant memory -> do work -> save durable memory
```

Aictx does not require a cloud account, embeddings, hosted sync, an external
model API, or network access for core memory commands.

## Documentation

Public docs live at [docs.aictx.dev](https://docs.aictx.dev).

Bundled docs are also available from the CLI:

```bash
aictx docs
aictx docs getting-started
aictx docs agent-integration --open
```

## Install

Aictx requires Node.js `>=22`.

Install globally for the simplest CLI and MCP setup:

```bash
npm install -g @aictx/memory
```

Global install is the recommended default for regular CLI use and optional MCP
use. You do not need to add Aictx to each project's `package.json` unless that
project should pin its own Aictx version.

For project-local version pinning:

```bash
pnpm add -D @aictx/memory
npm install -D @aictx/memory
```

If `aictx` is not on `PATH`, run commands through the package manager or local
binary:

```bash
pnpm exec aictx init
npm exec aictx init
./node_modules/.bin/aictx init
npx --package @aictx/memory -- aictx init
```

For MCP fallbacks:

```bash
pnpm exec aictx-mcp
npm exec aictx-mcp
./node_modules/.bin/aictx-mcp
npx --package @aictx/memory -- aictx-mcp
```

Package-manager and local-binary fallbacks are version-sensitive. If a local
install is stale, update it or use a current global/source binary before
trusting schema errors.

## Quickstart

Initialize memory storage inside an existing project:

```bash
aictx init
```

For first-run onboarding:

```bash
aictx setup
aictx setup --apply
```

Load relevant memory before non-trivial work:

```bash
aictx load "change auth routes"
```

Save durable memory after meaningful work:

```bash
aictx save --stdin
```

Saved memory is active immediately after Aictx validates and writes the patch.
Inspect memory asynchronously when needed:

```bash
aictx view
aictx diff
```

Aictx writes local files and never commits automatically.

## Mental model

`.aictx/` contains canonical memory and generated support files.

Canonical memory is the durable source of truth. It includes human-readable
Markdown bodies, JSON sidecars with structured metadata, relation JSON files,
and `events.jsonl` for semantic memory history. Generated state is rebuildable:
the SQLite search index, context packs, and exports can be regenerated from
canonical memory.

Aictx storage uses a hybrid memory model:

- `source` records preserve where context came from.
- Atomic memories capture precise reusable claims as `decision`, `constraint`,
  `question`, `fact`, `gotcha`, `workflow`, `note`, or `concept` objects.
- `synthesis` records maintain compact summaries for product intent, feature
  maps, roadmap, architecture, conventions, agent guidance, and repeated
  workflows.

Object types are `project`, `architecture`, `source`, `synthesis`, `decision`,
`constraint`, `question`, `fact`, `gotcha`, `workflow`, `note`, and `concept`.
Do not create `history`, `task-note`, or `feature` object types.

Load modes are `coding`, `debugging`, `review`, `architecture`, and
`onboarding`. Modes tune deterministic ranking and rendering only; they do not
broaden the project scope, call a model, use external retrieval, or load the
whole project.

## CLI and MCP boundary

The CLI is the default path for routine memory work. MCP remains a supported
integration path when the agent client has already launched and connected to
`aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory` in v1.

Setup, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
stale, and graph workflows remain outside local MCP. CLI-only capabilities are
not MCP parity gaps. Do not add or ask for MCP tools solely to mirror these CLI
commands, and do not edit `.aictx/` files directly when a supported MCP tool or
CLI command exists.

| Capability | MCP | CLI |
| --- | --- | --- |
| Load task context | `load_memory` | `aictx load` |
| Search memory | `search_memory` | `aictx search` |
| Inspect memory | `inspect_memory` | `aictx inspect` |
| Save memory patch | `save_memory_patch` | `aictx save` |
| Show memory diff | `diff_memory` | `aictx diff` |
| Initialize storage | none | `aictx init`, `aictx setup` |
| Maintain storage | none | `aictx check`, `aictx rebuild`, `aictx reset`, `aictx upgrade` |
| Recover memory history | none | `aictx history`, `aictx restore`, `aictx rewind` |
| Review patch files | none | `aictx patch review` |
| Inspect stale memory and graph neighborhoods | none | `aictx stale`, `aictx graph` |
| Export projections | none | `aictx export obsidian` |
| Manage project registry | none | `aictx projects` |
| View local memory | none | `aictx view` |
| Suggest or audit memory | none | `aictx suggest`, `aictx audit` |
| Read public docs | none | `aictx docs` |

`aictx view [--port <number>] [--open] [--detach] [--json]` starts the local
read-only memory viewer. `aictx view` is CLI-only in v1.

## Agent memory discipline

Agents should:

- Load narrowly before non-trivial work.
- Save only durable knowledge directly as active memory.
- Update existing memory before creating duplicates.
- Stale or supersede wrong old memory when current evidence invalidates it.
- Delete memory that should not persist.
- Prefer current code and user requests over loaded memory when they conflict.
- Report whether memory changed; inspection can happen asynchronously through
  the viewer, `aictx diff`, or Git tools.
- Save nothing when the task produced no durable future value.

Right-size memory. Use atomic memories for precise reusable claims,
`synthesis` memories for compact area-level understanding, and `source`
memories to preserve where context came from. Create relations only when the
connection matters, using predicates such as `derived_from`, `summarizes`,
`documents`, `requires`, `depends_on`, `affects`, or `supersedes`.

Use `update_object`, `mark_stale`, `supersede_object`, `delete_object`, and
`create_relation` when they fit better than creating another object. Use
`gotcha` for known failure modes and traps. Use `workflow` for repeated project
procedures.

Dirty or untracked `.aictx/` files are not by themselves a reason to skip saving
durable memory. Dirty state is not a preflight blocker. Aictx backs up dirty
touched files under `.aictx/recovery/` before overwrite/delete and continues
where possible.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm test:local
pnpm build:docs
```

The package provides two binaries:

- `aictx`: the command-line interface
- `aictx-mcp`: the MCP stdio server for AI coding clients

## AI-agent setup prompt

Copy and paste this prompt into an AI coding agent to set up a repository:

```text
Set up fresh Aictx memory for this Aictx source repository.

First reinstall the current Aictx package globally:
npm install -g @aictx/memory@0.1.24

Then reset the local `.aictx/` state with the Aictx CLI:
aictx reset

Run the initial onboarding and apply the conservative bootstrap memory patch:
aictx setup --apply

Finally, run:
aictx check
```

Inspect the accepted memory later with `aictx view` or `aictx diff` when needed.
