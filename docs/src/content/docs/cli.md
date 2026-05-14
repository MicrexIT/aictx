---
title: CLI guide
description: Setup, routine work, inspection, recovery, export, docs, and viewer commands.
---

The CLI is the default interface for Aictx. It is the quickest path for setup,
routine memory work, inspection, recovery, export, documentation, and the local
viewer.

Most days, an agent only needs:

```bash
aictx load "task summary"
aictx remember --stdin
aictx diff
```

The rest of the CLI is there for setup, review, recovery, and maintenance.

## Quick checks

```bash
aictx check
aictx diff
aictx view --open
```

- `check` validates canonical memory and generated index health.
- `diff` shows memory changes, including untracked files in Git projects.
- `view --open` starts the local browser viewer.

## Setup and bootstrap

```bash
aictx init
aictx setup
aictx setup --dry-run
aictx setup --no-view
aictx setup --open
aictx patch review bootstrap-memory.json
```

- `setup` is the normal onboarding command; it initializes storage if needed,
  applies conservative bootstrap memory by default, and starts the local
  viewer for inspection.
- `init` is the lower-level empty-storage initializer for automation, tests, and manual workflows.
- `setup --dry-run` previews the bootstrap patch and role coverage without
  initializing storage, writing repo files, running checks, or starting the
  viewer.
- `setup --force --dry-run` previews reset/setup behavior without deleting or
  rewriting anything.
- `setup --no-view` skips viewer startup; `setup --open` also opens the viewer
  in the default browser.
- `patch review` reviews a structured memory patch without writing it.

:::tip
If memory is empty after `init`, use `aictx setup` before hand-writing memory.
The bootstrap flow is designed for exactly that first-run gap.
:::

## Routine memory work

```bash
aictx load "change auth routes"
aictx search "auth route conventions"
aictx inspect decision.auth-route-conventions
aictx suggest --after-task "change auth routes" --json
aictx audit --json
aictx remember --stdin
```

The routine loop is narrow load, work, and save only durable knowledge as active
memory. A task that produced no reusable project knowledge does not need a save.
Use `remember` for normal intent-first memory creation, and `save` only when
you need to submit a structured patch directly. In `suggest --after-task --json`,
use `recommended_actions` as the primary advisory save/no-save aid; fill in
semantic `title`, `body`, and `reason` fields yourself because Aictx does not
infer durable project meaning from diffs.

Commands that support structured output accept `--json`:

```bash
aictx check --json
```

## Inspection and debugging

```bash
aictx stale
aictx graph <id>
aictx lens project-map
aictx lens current-work
aictx handoff show
```

`audit` includes role coverage gaps, but missing roles are not `check`
failures. `stale` lists stale and superseded memory. `graph` shows a one-hop
relation neighborhood for debugging retrieval and provenance. `lens` renders
readable project views with role coverage and generated gaps. `handoff`
preserves unfinished current-branch state without making it project truth;
`handoff show` only returns an active current-branch handoff.

## Maintenance

```bash
aictx check
aictx rebuild
aictx upgrade
aictx reset
aictx reset --all
```

`rebuild` regenerates indexes from canonical memory. `reset` backs up and clears
local `.aictx/` storage. `reset --all` resets every project in the user-level
registry; add `--destroy` only when you intend to delete each registered
`.aictx/` without backup.

## Git inspection and recovery

```bash
aictx diff
aictx history
aictx restore <commit>
aictx rewind
```

Aictx writes local files and never commits automatically. Git remains the source
of truth for history and rollback when the project is inside a Git worktree.

## Export, viewer, and docs

```bash
aictx export obsidian
aictx projects list
aictx view --open
aictx docs
aictx docs getting-started
aictx docs demand-driven-memory
aictx docs agent-recipes
aictx docs agent-integration --open
```

`aictx view` starts a local memory viewer. `aictx docs` lists bundled
public docs topics. `aictx docs <topic>` prints bundled Markdown for that topic.
`--open` opens the hosted docs site.

## CLI and MCP

MCP is available when the agent client has launched and connected to
`aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, lenses,
handoff, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
and stale workflows are CLI-only in v1. Graph inspection is available in the
CLI and local viewer, but remains outside MCP. These non-MCP surfaces are part
of the v1 integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.
