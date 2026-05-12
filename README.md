# Aictx

[![CI](https://github.com/MicrexIT/aictx/actions/workflows/ci.yml/badge.svg)](https://github.com/MicrexIT/aictx/actions/workflows/ci.yml)
[![CodeQL](https://github.com/MicrexIT/aictx/actions/workflows/codeql.yml/badge.svg)](https://github.com/MicrexIT/aictx/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/@aictx/memory)](https://www.npmjs.com/package/@aictx/memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Aictx gives AI coding agents a project memory they can come back to.

Use it when you are tired of re-explaining the same product intent,
architecture decisions, repo conventions, setup steps, and known traps every
time a new chat or agent session starts. Aictx stores durable project facts,
decisions, warnings, workflows, source records, and syntheses under `.aictx/`
as reviewable local files, indexes them locally for fast retrieval, and keeps
them compatible with Git workflows.

```text
load relevant memory -> do work -> save durable memory
```

Aictx does not require a cloud account, embeddings, hosted sync, an external
model API, or network access for core memory commands. Saved memory is active
immediately after Aictx validates and writes it, and Aictx never commits for
you.

This repository publishes the npm package `@aictx/memory`. It is unrelated to
similarly named packages in other ecosystems.

## Why Aictx?

Aictx is for durable project context that should survive between agents,
sessions, branches, and reviews.

- Why not `AGENTS.md` only? Agent instruction files are good operating manuals,
  but they become too broad and static when they also try to hold product
  intent, decisions, gotchas, workflows, and source-backed summaries.
- Why not a vector DB or RAG stack? Those are useful for large retrieval
  systems. Aictx keeps v1 project memory local, inspectable, Git-aware, and
  usable without embeddings, hosted infrastructure, or a model API.
- Why not long context? Long context helps inside one session. It does not make
  memory reviewable, current, reusable across future sessions, or easy to clean
  up when facts go stale.
- Why local files? Plain files are reviewable and portable. Aictx builds on that
  foundation with validation, typed memory, a local index, task-focused loading,
  relation-aware inspection, and a save/no-save discipline.

## Documentation

The landing page lives at [aictx.dev](https://aictx.dev). Public docs live at
[docs.aictx.dev](https://docs.aictx.dev).

Good starting points:

- [Getting started](https://docs.aictx.dev/getting-started/)
- [Capabilities](https://docs.aictx.dev/capabilities/)
- [Specializing Aictx](https://docs.aictx.dev/specializing-aictx/)
- [Agent integration](https://docs.aictx.dev/agent-integration/)
- [Agent recipes](https://docs.aictx.dev/agent-recipes/)

Bundled docs are also available from the CLI:

```bash
aictx docs
aictx docs getting-started
aictx docs capabilities
aictx docs agent-integration --open
aictx docs agent-recipes
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

Set up useful first-run memory inside an existing project:

```bash
aictx setup
```

`setup` starts the local read-only viewer after writing memory so humans can
inspect the result immediately. Use `aictx setup --no-view` to skip viewer
startup in scripts or agent runs.

Preview the conservative bootstrap patch without writing or initializing
storage:

```bash
aictx setup --dry-run
```

`aictx setup --force --dry-run` previews reset/setup behavior without deleting
or rewriting anything.

`aictx init` is the lower-level empty-storage initializer for automation,
tests, or manual workflows. Its next step is normally `aictx setup`.

Load relevant memory before non-trivial work:

```bash
aictx load "change auth routes"
```

Save durable memory after meaningful work:

```bash
aictx remember --stdin
```

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
  workflows or how-to collections.

Setup, lenses, viewer, and audit use a built-in soft role catalog for readable
coverage: product intent, capability map, repository map, architecture and
patterns, stack/tooling, conventions/quality, workflows/how-tos, verification,
gotchas/risks, open questions, sources/provenance, agent guidance, and optional
branch handoff. Missing or thin project-truth roles are reported as generated
gaps, not as required placeholder files. Missing optional branch handoff is
counted in coverage without producing a gap.

```text
setup creates/repairs memory roles
load gives task-focused context
lens shows readable project views
remember saves durable discoveries
handoff preserves unfinished branch state
```

`aictx audit` includes role coverage gaps after normal audit findings, but
missing roles are warnings/gaps only; `aictx check` does not fail because a role
is empty. `aictx handoff show` shows only an active current-branch handoff;
closed handoffs remain historical memory for `aictx inspect`, `aictx view`, and
Git history.

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
`remember_memory`, `save_memory_patch`, and `diff_memory` in v1.

Local MCP is the near-term integration path for MCP-capable local agent
harnesses. Remote MCP, hosted sync, cloud hosting, OAuth or cloud auth,
tenancy, billing, and ChatGPT App SDK UI remain future work. Future
ChatGPT-compatible `search`/`fetch` names are adapter aliases over Aictx
search/inspect behavior, not local MCP tool names.

Setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs,
suggest, audit, stale, and graph workflows remain outside local MCP. CLI-only
capabilities are not MCP parity gaps. Do not add or ask for MCP tools solely to
mirror these CLI commands, and do not edit `.aictx/` files directly when a
supported MCP tool or CLI command exists.

| Capability | MCP | CLI |
| --- | --- | --- |
| Load task context | `load_memory` | `aictx load` |
| Search memory | `search_memory` | `aictx search` |
| Inspect memory | `inspect_memory` | `aictx inspect` |
| Remember durable context | `remember_memory` | `aictx remember` |
| Save structured patch | `save_memory_patch` | `aictx save` |
| Show memory diff | `diff_memory` | `aictx diff` |
| Initialize storage | none | `aictx init`, `aictx setup` |
| Maintain storage | none | `aictx check`, `aictx rebuild`, `aictx reset`, `aictx upgrade` |
| Recover memory history | none | `aictx history`, `aictx restore`, `aictx rewind` |
| Review patch files | none | `aictx patch review` |
| Inspect stale memory and graph neighborhoods | none | `aictx stale`, `aictx graph` |
| Show readable memory views | none | `aictx lens` |
| Manage branch handoff | none | `aictx handoff` |
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
`gotcha` for known failure modes and traps. Use `workflow` for repeated
project-specific how-tos: procedures, runbooks, command sequences,
release/debugging/migration paths, verification routines, and maintenance
steps. Generic tutorials, one-off task notes, and task diaries should not become
workflow memory.

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

For contribution workflow, branch protection, and AI-agent git instructions,
see [CONTRIBUTING.md](CONTRIBUTING.md). The short version is: work on a feature
branch, open a pull request to `main`, wait for required checks, then merge the
pull request instead of pushing directly to `main`.

## Project health

- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Support paths: [SUPPORT.md](SUPPORT.md)
- Public roadmap: [ROADMAP.md](ROADMAP.md)
- Release policy: [RELEASE.md](RELEASE.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

Public releases should have matching `vX.Y.Z` Git tags and npm provenance.
The default branch is protected and requires pull requests plus CI/security
checks before merge.

## AI-agent setup prompt

Copy and paste this prompt into an AI coding agent to set up a repository:

```text
Set up fresh Aictx memory for this Aictx source repository.

First reinstall the current Aictx package globally:
npm install -g @aictx/memory@0.1.33

Then back up and clear the local `.aictx/` state with the Aictx CLI:
aictx reset

Run the initial onboarding, apply the conservative bootstrap memory patch, and
start the local viewer:
aictx setup

Finally, run:
aictx check
```

Inspect the accepted memory later with `aictx view` or `aictx diff` when needed.
