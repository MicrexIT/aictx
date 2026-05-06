---
title: CLI guide
description: Setup, routine work, inspection, recovery, export, docs, and viewer commands.
---

# CLI guide

The CLI is the default interface for Aictx. It covers setup, routine memory
work, inspection, recovery, export, documentation, and the local viewer.

MCP is available when the agent client has launched and connected to
`aictx-mcp`. Local MCP exposes exactly `load_memory`, `search_memory`,
`inspect_memory`, `save_memory_patch`, and `diff_memory`. Setup, maintenance,
recovery, export, registry, viewer, docs, suggest, audit, stale, and graph
workflows are CLI-only in v1. These CLI-only commands are part of the v1
integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work, and future `search`/`fetch` adapter names are not local MCP tool names.

CLI commands render human-readable output by default. Commands that support
structured output accept `--json`:

```bash
aictx check --json
```

## Setup and maintenance

```bash
aictx init
aictx setup
aictx check
aictx rebuild
aictx reset
aictx reset --all
```

- `init` creates `.aictx/` and optional repo-level agent guidance.
- `setup` guides first-run onboarding and bootstrap memory preview.
- `check` validates canonical memory and generated index health.
- `rebuild` regenerates indexes from canonical memory.
- `reset` backs up and clears local `.aictx/` storage.
- `reset --all` resets every project in the user-level registry. Add
  `--destroy` to delete each registered `.aictx/` without backup.

## Routine memory work

```bash
aictx load "change auth routes"
aictx suggest --after-task "change auth routes" --json
aictx audit --json
aictx save --stdin
aictx search "auth route conventions"
```

The routine loop is narrow load, work, and save only durable knowledge as active
memory. A task that produced no reusable project knowledge does not need a save.

## Inspection and debugging

```bash
aictx inspect <id>
aictx stale
aictx graph <id>
```

These commands inspect one memory object, list stale or superseded memory, and
show a one-hop relation neighborhood.

## Git inspection and recovery

```bash
aictx diff
aictx history
aictx restore <commit>
aictx rewind
```

Aictx writes local files and never commits automatically. Git remains the source
of truth for history and rollback when the project is inside a Git worktree.

## Export and viewer

```bash
aictx export obsidian
aictx projects list
aictx view --open
```

`aictx view` starts a local, read-only memory viewer. It is CLI-only in v1 and
has no MCP equivalent.

## Documentation

```bash
aictx docs
aictx docs getting-started
aictx docs demand-driven-memory
aictx docs agent-integration --open
```

`aictx docs` lists bundled public docs topics. `aictx docs <topic>` prints the
bundled Markdown for that topic. `--open` opens the hosted docs site.
