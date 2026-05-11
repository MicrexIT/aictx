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
aictx remember --stdin
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
aictx setup
aictx setup --dry-run
aictx setup --view
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
```

`setup` is the normal first-run command. It creates local storage if needed,
updates optional repo-level agent guidance, writes conservative source-backed
role memory by default, runs checks, and prints role coverage. `init` remains
available as the lower-level empty-storage initializer.

`setup --dry-run` is read-only: it does not initialize storage, update guidance
files, write memory, run checks, or start the viewer. `setup --force --dry-run`
previews reset/setup behavior without deleting or rewriting anything.

Setup reports soft roles for product intent, capability map, repository map,
architecture/patterns, stack/tooling, conventions/quality, workflows/how-tos,
verification, gotchas/risks, open questions, sources/provenance, agent
guidance, and optional branch handoff. Missing or thin roles are generated gaps,
not placeholder memory files. Missing optional branch handoff is counted without
a generated gap. Reusable project how-tos fit the existing `workflow` object
type and `workflow` facet.

After setup, `aictx lens project-map` is a good readable overview and
`aictx load "onboard to this repository"` is a good first retrieval check. Use
[Agent recipes](/agent-recipes/) for copyable setup prompts tailored to common
coding agents.

## Memory quality and maintenance

Use these when memory needs cleanup, review, or a save/no-save decision:

```bash
aictx suggest --after-task "fix Stripe webhook retries" --json
aictx suggest --from-diff --json
aictx audit --json
aictx stale
aictx graph <id>
aictx lens review-risk
aictx handoff show
```

- `suggest --after-task` gives an agent a read-only decision packet at the end
  of work. Its `recommended_actions` field is the primary advisory save/no-save
  guide; agents still fill in semantic memory content themselves.
- `audit` includes role coverage gaps, but missing roles are not `check`
  failures.
- `handoff show` returns only an active handoff for the current branch. Closed
  handoffs remain historical memory for inspect, view, and Git history.
- `suggest --from-diff` looks at current Git changes and proposes memory
  maintenance ideas.
- `audit` reports deterministic hygiene issues.
- `stale` lists stale and superseded memory.
- `graph` shows a one-hop relation neighborhood for debugging.
- `lens` renders readable views with role coverage, relation context, and gaps.
- `handoff` preserves unfinished current-branch state until it is closed or promoted.

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
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, lenses,
handoff, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
stale, and graph workflows are CLI-only in v1. These CLI-only commands are part
of the v1 integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.
