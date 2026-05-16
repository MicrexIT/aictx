---
title: Capabilities
description: What Aictx can do in v1, grouped by user and agent jobs.
---

Aictx is built around a small memory loop. Most commands either load useful
context, save durable context, help a human inspect memory, or repair storage
when something needs attention.

## Routine memory work

Use these on most tasks:

```bash
aictx load "fix Stripe webhook retries"
aictx search "webhook retry convention"
aictx inspect decision.billing-retries
aictx remember --stdin
aictx diff
```

- `load` builds a task-focused memory pack.
- `search` finds specific memory without loading a full pack.
- `inspect` opens one memory object and its direct relations.
- `remember` saves durable project knowledge from intent-first input.
- `diff` shows tracked and untracked `.aictx/` changes in Git projects.

:::tip
Start with `load` for normal coding tasks. Use `search` when you already know
what kind of memory you are looking for.
:::

## Setup and bootstrap

Use these when a project is new to Aictx or memory feels too thin:

```bash
aictx setup
aictx setup --dry-run
aictx setup --no-view
aictx setup --open
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
```

`setup` is the normal first-run command. It creates local storage if needed,
updates optional repo guidance, writes conservative source-backed memory, runs
checks, reports role coverage, and starts the local viewer unless told not to.

After setup, `aictx lens project-map` gives a readable overview and
`aictx load "onboard to this repository"` checks that retrieval is useful.

## Memory quality and maintenance

Use these when memory needs review, cleanup, or a save/no-save decision:

```bash
aictx suggest --after-task "fix Stripe webhook retries" --json
aictx suggest --from-diff --json
aictx audit --json
aictx stale
aictx graph <id>
aictx lens review-risk
aictx handoff show
```

- `suggest --after-task` gives an agent an advisory save/no-save packet.
- `suggest --from-diff` proposes maintenance ideas from current Git changes.
- `audit` reports deterministic hygiene issues and role coverage gaps.
- `stale` lists stale and superseded memory.
- `graph` shows nearby relations for debugging.
- `lens` renders readable project views.
- `handoff` preserves unfinished branch state without making it project truth.

:::tip
When a user correction reveals old memory was wrong, update, stale, supersede,
or delete the existing memory instead of creating a near-duplicate.
:::

## Human inspection

Use these when you want to inspect memory without editing raw `.aictx/` files:

```bash
aictx view --open
aictx projects list
aictx export obsidian
aictx docs
```

`view` starts the local browser viewer. `projects` manages the viewer registry.
`export obsidian` writes a generated Obsidian-compatible projection. `docs`
prints bundled docs topics or opens the hosted docs site.

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

## MCP

MCP covers the routine memory actions when your client is already configured for
`aictx-mcp`. Setup, viewer, maintenance, recovery, wiki, and other operational
flows stay in the CLI. For the exact map, see the [MCP guide](/mcp/) and
[Reference](/reference/).
