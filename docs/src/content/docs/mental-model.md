---
title: Mental model
description: How Aictx stores, indexes, retrieves, and inspects project memory.
---

# Mental model

Aictx is a memory discipline system, not just a storage folder.

The product goal is simple: future agents should not restart from zero when
working in a project. They should load the durable context that matters, do the
task, and save only reusable knowledge that future agents can safely rely on.

## Canonical memory

`.aictx/` contains canonical memory and generated support files.

Canonical memory is the durable source of truth. It includes human-readable
Markdown bodies, JSON sidecars with structured metadata, relation JSON files,
and `events.jsonl` for semantic memory history. Saved memory is accepted as
active memory immediately after Aictx validates and writes it.

Generated state is rebuildable. The SQLite search index, context packs, and
exports can be regenerated from canonical memory. Do not hand-edit generated
state when a supported Aictx command can produce it.

## Hybrid memory model

Aictx uses three layers:

- `source` records preserve where context came from, such as README files,
  package manifests, AGENTS/CLAUDE/rules, issues, external references recorded
  by an agent, or user-stated context.
- Atomic memories capture precise reusable claims as `decision`, `constraint`,
  `fact`, `gotcha`, `workflow`, `question`, `note`, or `concept` objects.
- `synthesis` records maintain compact summaries for product intent, feature
  maps, roadmap, architecture, conventions, agent guidance, and repeated
  workflows.

Object types are `project`, `architecture`, `source`, `synthesis`, `decision`,
`constraint`, `question`, `fact`, `gotcha`, `workflow`, `note`, and `concept`.
Do not create `history`, `task-note`, or `feature` object types. Use Git,
events, and object statuses for history; branch or task scope for temporary task
context; and `concept` or `synthesis` facets for product capabilities.

## Retrieval

`aictx load "<task summary>"` compiles a task-focused context pack. Load modes
such as `coding`, `debugging`, `review`, `architecture`, and `onboarding` tune
deterministic ranking and rendering. They do not broaden the project scope, call
a model, use external retrieval, or load the whole project.

## Async inspection

Aictx writes inspectable files. Use the local viewer or, in Git projects, the
memory diff:

```bash
aictx view
aictx diff
```

Plain `git diff -- .aictx/` can omit untracked memory files before staging.
`aictx diff` includes tracked and untracked Aictx memory changes.
