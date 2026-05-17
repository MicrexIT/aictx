---
title: Demand-driven memory
description: How real agent failure, confusion, and correction improve durable project memory.
---

Memory is most useful when memory improves from real work.

When an agent fails, asks for missing project context, finds stale assumptions,
or receives a correction from the user, that event is evidence. It may mean the
project memory needs to be updated, marked stale, superseded, deleted, or
expanded with a better source-backed summary.

The loop is:

```text
load -> work/fail/correction -> identify memory gap -> save memory repair
```

## What counts as a signal

A task is a memory-quality signal when it reveals durable context that future
agents should not rediscover:

- Missing architecture, workflow, or product context blocked the task.
- Loaded memory contradicted current code, tests, docs, or the user request.
- The user corrected an assumption that is likely to recur.
- Two active memories conflict and the agent cannot safely choose between them.
- Knowledge was tribal: only the user knew it, but future agents will need it.

:::tip
The best memory repairs often come from friction. If an agent made a plausible
wrong assumption, capture the corrected fact or mark the stale memory so the
next agent does not repeat it.
:::

## Repair with existing primitives

Common repairs use the same memory types as normal work:

- `source` for provenance
- `question` for missing knowledge or unresolved conflict
- `gotcha` for repeated failure modes
- `synthesis` for compact maintained context
- `workflow` for project-specific how-tos and repeated procedures
- `decision`, `constraint`, `fact`, and `concept` for precise claims
- relations when the link matters

Facets such as `domain`, `bounded-context`, `capability`, `business-rule`, and
`unresolved-conflict` are optional retrieval hints. Keep them plain-language.

## When to save nothing

Save nothing when the task produced no durable future value. Passing tests,
renaming a local variable, or trying a temporary debugging command usually does
not need memory.

Save memory when future agents would otherwise waste time, repeat a mistake, or
need user correction to learn the same thing.
