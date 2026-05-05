---
title: CLI guide
description: Setup, routine work, inspection, recovery, export, docs, and viewer commands.
---

# CLI guide

The CLI is the default path for routine Aictx work. MCP is supported only when
the agent client has already launched and connected to `aictx-mcp`.

All CLI commands render human-readable output by default. Add `--json` for the
shared response envelope:

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
```

- `init` creates `.aictx/` and optional repo-level agent guidance.
- `setup` guides first-run onboarding and bootstrap memory preview.
- `check` validates canonical memory and generated index health.
- `rebuild` regenerates indexes from canonical memory.
- `reset` backs up and clears local `.aictx/` storage.

## Routine memory work

```bash
aictx load "change auth routes"
aictx suggest --after-task "change auth routes" --json
aictx audit --json
aictx save --stdin
aictx search "auth route conventions"
```

Load narrowly before non-trivial work. Save only durable knowledge directly as
active memory. Saving nothing is valid when the task produced no durable future
value.

## Inspection and debugging

```bash
aictx inspect <id>
aictx stale
aictx graph <id>
```

Use these commands to inspect one memory object, list stale/superseded memory,
or view a one-hop relation neighborhood.

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

`aictx view` starts a local, read-only memory viewer. It is CLI-only in v1.
CLI-only capabilities are not MCP parity gaps.

## Documentation

```bash
aictx docs
aictx docs getting-started
aictx docs agent-integration --open
```

`aictx docs` lists bundled public docs topics. `aictx docs <topic>` prints the
bundled Markdown for that topic. Use `--open` to open the hosted docs site.
