---
title: Capabilities
description: What Aictx can do in v1, grouped by user and agent jobs.
---

Aictx is intentionally narrow: it gives coding agents a local memory substrate,
then leaves semantic judgment to the agent and review to the developer.

This page maps the v1 feature set to the jobs you will actually do.

## Routine memory work

Use these on most tasks:

```bash
aictx load "fix Stripe webhook retries"
aictx search "webhook retry convention"
aictx inspect decision.billing-retries
aictx save --stdin
aictx diff
```

- `load` compiles task-focused context.
- `search` finds memory without loading a full context pack.
- `inspect` opens one memory object and its direct relations.
- `save` writes a structured patch after validation.
- `diff` shows tracked and untracked `.aictx/` changes in Git projects.

:::tip
Start with `load`, not `search`, for normal coding tasks. `load` gives the agent
a compact working packet; `search` is better when you already know the kind of
memory you are looking for.
:::

## Setup and bootstrap

Use these when a project is new to Aictx or memory feels too thin:

```bash
aictx init
aictx setup
aictx setup --apply
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
```

`init` creates local storage and optional repo-level agent guidance. `setup`
orchestrates the first-run bootstrap path so Aictx can seed source-backed
project intent, feature map, roadmap, architecture, conventions, and agent
guidance when current repo evidence supports it.

## Memory quality and maintenance

Use these when memory needs cleanup, review, or a save/no-save decision:

```bash
aictx suggest --after-task "fix Stripe webhook retries" --json
aictx suggest --from-diff --json
aictx audit --json
aictx stale
aictx graph <id>
```

- `suggest --after-task` gives an agent a read-only decision packet at the end
  of work.
- `suggest --from-diff` looks at current Git changes and proposes memory
  maintenance ideas.
- `audit` reports deterministic hygiene issues.
- `stale` lists stale and superseded memory.
- `graph` shows a one-hop relation neighborhood for debugging.

:::tip
When a user correction reveals that old memory was wrong, prefer updating,
marking stale, superseding, or deleting the existing object over creating
another near-duplicate.
:::

## Human inspection

Use these when you want to inspect memory without editing raw `.aictx/` files:

```bash
aictx view --open
aictx projects list
aictx export obsidian
aictx docs
```

`aictx view` starts a local, read-only browser viewer. `projects` manages the
user-level registry used by the viewer. `export obsidian` writes a generated
Obsidian-compatible projection. `docs` prints bundled public docs or opens the
hosted docs site.

## Validation and recovery

Use these when storage, indexes, or Git-backed history need attention:

```bash
aictx check
aictx rebuild
aictx upgrade
aictx history
aictx restore <commit>
aictx rewind
aictx reset
```

- `check` validates canonical memory and generated index health.
- `rebuild` recreates generated indexes from canonical memory.
- `upgrade` migrates supported storage to the latest schema.
- `history`, `restore`, and `rewind` use Git when available.
- `reset` backs up and clears local Aictx storage.

## MCP equivalents

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows are CLI-only
in v1. These CLI-only commands are part of the v1 integration model rather than
MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.
