---
title: Demand-driven memory
description: Use real agent failure, confusion, and correction to improve durable project memory.
---

# Demand-driven memory

Aictx is most useful when memory quality improves from real work.

When an agent fails, asks for missing project context, finds stale assumptions,
or receives a correction from the user, treat that as evidence that project
memory may need repair.

The loop is:

```text
load -> work/fail/correction -> identify memory gap -> save memory repair
```

## What counts as a signal

Repair memory when a task reveals durable context that future agents should not
rediscover:

- Missing architecture, workflow, or product context blocked the task.
- Loaded memory contradicted current code, tests, docs, or the user request.
- The user corrected an assumption that is likely to recur.
- Two active memories conflict and the agent cannot safely choose between them.
- Knowledge was tribal: only the user knew it, but future agents will need it.

## Repair with existing primitives

Use existing Aictx objects before inventing anything new:

- `source` for provenance.
- `question` for missing knowledge or unresolved conflict.
- `gotcha` for repeated failure modes.
- `synthesis` for compact maintained context.
- `decision`, `constraint`, `fact`, `workflow`, and `concept` for precise claims.
- Relations when the link matters.

Facets such as `domain`, `bounded-context`, `capability`, `business-rule`, and
`unresolved-conflict` are organization hints. They are optional and should stay
plain-language.

## Keep it local-first

Demand-driven memory is not broad enterprise ingestion. Aictx should improve
local memory quality before adding external inputs such as Slack, Jira,
Confluence, hosted sync, embeddings, background scanners, or expert graphs.
