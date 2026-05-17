---
title: Capabilities
description: What Memory can do in v1, grouped by user and agent jobs.
---

Memory is built around a small memory loop. Most commands either load useful
context, save durable context, help a human inspect memory, or repair storage
when something needs attention.

## Routine memory work

Use these on most tasks:

```bash
memory load "fix Stripe webhook retries"
memory search "webhook retry convention"
memory inspect decision.billing-retries
memory remember --stdin
memory diff
```

- `load` builds a task-focused memory pack.
- `search` finds specific memory without loading a full pack.
- `inspect` opens one memory object and its direct relations.
- `remember` saves durable project knowledge from intent-first input.
- `diff` shows tracked and untracked `.memory/` changes in Git projects.

:::tip
Start with `load` for normal coding tasks. Use `search` when you already know
what kind of memory you are looking for.
:::

## Setup and bootstrap

Use these when a project is new to Memory or memory feels too thin:

```bash
memory setup
memory setup --dry-run
memory setup --no-view
memory setup --open
memory suggest --bootstrap --patch > bootstrap-memory.json
memory patch review bootstrap-memory.json
```

`setup` is the normal first-run command. It creates local storage if needed,
updates optional repo guidance, writes conservative source-backed memory, runs
checks, reports role coverage, and starts the local viewer unless told not to.

After setup, `memory lens project-map` gives a readable overview and
`memory load "onboard to this repository"` checks that retrieval is useful.

## Memory quality and maintenance

Use these when memory needs review, cleanup, or a save/no-save decision:

```bash
memory suggest --after-task "fix Stripe webhook retries" --json
memory suggest --from-diff --json
memory audit --json
memory stale
memory graph <id>
memory lens review-risk
memory handoff show
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

Use these when you want to inspect memory without editing raw `.memory/` files:

```bash
memory view --open
memory projects list
memory export obsidian
memory docs
```

`view` starts the local browser viewer. `projects` manages the viewer registry.
`export obsidian` writes a generated Obsidian-compatible projection. `docs`
prints bundled docs topics or opens the hosted docs site.

## Validation and recovery

Use these when storage, indexes, or Git-backed history need attention:

```bash
memory check
memory rebuild
memory upgrade
memory history
memory restore <commit>
memory rewind
memory reset
```

- `check` validates canonical memory and generated index health.
- `rebuild` recreates generated indexes from canonical memory.
- `upgrade` migrates supported storage to the latest schema.
- `history`, `restore`, and `rewind` use Git when available.
- `reset` backs up and clears local Memory storage.

## MCP

MCP covers the routine memory actions when your client is already configured for
`memory-mcp`. Setup, viewer, maintenance, recovery, wiki, and other operational
flows stay in the CLI. For the exact map, see the [MCP guide](/mcp/) and
[Reference](/reference/).
