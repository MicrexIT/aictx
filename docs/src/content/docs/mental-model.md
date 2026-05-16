---
title: Mental model
description: How Aictx stores, indexes, retrieves, and inspects project memory.
---

Aictx helps future agents start from durable project context instead of a blank
chat. The important distinction is between memory that should last and working
context that belongs only to the current task.

## The short version

```text
canonical memory -> generated index -> task-focused context pack
```

Canonical memory is the durable source of truth. Generated state is rebuildable.
The context pack is what an agent gets for a specific task.

## Why not just use existing context?

Agent instruction files such as `AGENTS.md` are still useful. Keep them short:
when to load memory, when to save, and which tooling boundaries matter. If they
also carry every product decision, source record, workflow, gotcha, and evolving
synthesis, they become broad and stale.

Vector databases and RAG systems are useful when you need a large retrieval
service. Aictx takes a smaller path for project memory: local files,
deterministic indexes, Git review, and focused retrieval.

Long context helps inside one session, but it does not decide what should be
remembered, preserve reviewable provenance, clean up stale facts, or prepare the
next agent.

Plain local files are the foundation. Aictx adds validation, memory types,
generated indexes, task-focused loading, relation-aware inspection, and a
save/no-save discipline so the files remain useful.

## Canonical memory

`.aictx/` contains canonical memory and generated support files.

Canonical memory includes human-readable Markdown bodies, JSON sidecars with
structured metadata, relation JSON files, and `events.jsonl` for semantic
history. Saved memory becomes active after Aictx validates and writes it.

Generated state can be recreated:

```bash
aictx check
aictx rebuild
```

## Hybrid memory model

Aictx uses three layers:

- `source` records preserve where context came from, such as README files,
  package manifests, issues, external references recorded by an agent, or
  user-stated context.
- Atomic memories capture precise reusable claims, such as decisions, facts,
  constraints, gotchas, workflows, questions, notes, or concepts.
- `synthesis` records maintain compact summaries for product intent, feature
  maps, roadmap, architecture, conventions, agent guidance, and repeated
  workflows.

Use a workflow memory for durable project-specific procedures: release steps,
debugging paths, migration routines, verification checks, and maintenance
commands. Do not turn generic tutorials or task diaries into project memory.

:::tip
Keep memories shaped like things future agents can use. A synthesis should
replace rereading scattered docs. An atomic memory should usually carry one
durable claim.
:::

For the exact object taxonomy, see [Reference](/reference/).

## Demand-driven memory quality

Real work improves memory quality. Agent failure, confusion, stale loaded
context, and user correction are signals that memory may need repair.

The loop is:

```text
load -> work/fail/correction -> identify memory gap -> save memory repair
```

See [Demand-driven memory](/demand-driven-memory/) for the user-facing workflow.

## Retrieval

`aictx load "<task summary>"` compiles a task-focused context pack. Load modes
such as `coding`, `debugging`, `review`, `architecture`, and `onboarding` tune
deterministic ranking and rendering.

Use `aictx search "<query>"` when you need targeted lookup. Use `aictx inspect
<id>` when you already know which memory object matters.

## Inspection

Aictx writes inspectable files. The local viewer and, in Git projects, the
memory diff show the current state:

```bash
aictx view
aictx diff
```

Plain `git diff -- .aictx/` can omit untracked memory files before staging.
`aictx diff` includes tracked and untracked Aictx memory changes.

## CLI and MCP

Use the CLI by default. MCP is available for clients that launch `aictx-mcp` and
want routine memory tools inside the client. See the [MCP guide](/mcp/) for the
exact boundary.
