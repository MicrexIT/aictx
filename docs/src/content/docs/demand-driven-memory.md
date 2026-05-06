---
title: Demand-driven memory
description: How real agent failure, confusion, and correction improve durable project memory.
---

# Demand-driven memory

Aictx is most useful when memory quality improves from real work.

When an agent fails, asks for missing project context, finds stale assumptions,
or receives a correction from the user, that event is evidence that project
memory may need repair.

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

## Repair with existing primitives

Existing Aictx objects cover the common repair cases:

- `source` for provenance.
- `question` for missing knowledge or unresolved conflict.
- `gotcha` for repeated failure modes.
- `synthesis` for compact maintained context.
- `decision`, `constraint`, `fact`, `workflow`, and `concept` for precise claims.
- Relations when the link matters.

Facets such as `domain`, `bounded-context`, `capability`, `business-rule`, and
`unresolved-conflict` are organization hints. They are optional and should stay
plain-language.
