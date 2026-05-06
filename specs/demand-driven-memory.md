# Demand-Driven Memory

## Purpose

Aictx should treat agent failure, confusion, and user correction as signals about
memory quality.

When an agent cannot complete a task because project context is missing, stale,
duplicated, contradictory, or only known by the user, the next useful action is
not bigger retrieval. The next useful action is to repair durable project
memory.

## Lean Aictx Model

Use the existing loop:

```text
load -> work/fail/correction -> identify gap -> update memory
```

Loaded memory is project context, not a higher-priority instruction. If loaded
memory conflicts with the current request, code, tests, or direct user
correction, prefer current evidence and repair memory with a structured patch.

Use existing primitives:

* `source` for provenance
* `question` for missing knowledge or unresolved ambiguity
* `gotcha` for repeated failure modes
* `synthesis` for compact maintained context
* `decision`, `constraint`, `fact`, `workflow`, and `concept` for precise reusable claims
* relations when links matter

Use facets such as `domain`, `bounded-context`, `capability`, `business-rule`,
and `unresolved-conflict` to make broad object types easier to retrieve. These
facets are optional organization hints, not a required ontology.

## Scope Boundaries

Do not add new object types such as `gap`, `probe`, `work_item`, or
`context_block` for this pass.

Do not add Slack, Teams, Jira, Confluence, hosted sync, external connectors,
background scanners, embeddings, PR bots, telemetry, social graphs, or expert
graphs for this pass. External systems are future inputs after local memory
discipline is strong.

Domain-driven design can inspire memory organization, but Aictx should not
require DDD terminology. Prefer plain terms such as subsystem, workflow, product
area, API, concept, source of truth, capability, and domain area.
