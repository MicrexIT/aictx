---
title: Reference
description: Compact CLI, MCP, docs, object taxonomy, and structured patch reference.
---

## CLI commands

The CLI is the default interface for routine memory work.

| Area | Commands |
| --- | --- |
| Setup | `aictx init`, `aictx setup` |
| Maintenance | `aictx check`, `aictx rebuild`, `aictx reset`, `aictx upgrade` |
| Routine memory | `aictx load`, `aictx search`, `aictx suggest`, `aictx audit`, `aictx save` |
| Inspection | `aictx inspect`, `aictx stale`, `aictx graph` |
| Inspection and recovery | `aictx diff`, `aictx history`, `aictx restore`, `aictx rewind` |
| Export | `aictx export obsidian` |
| Viewer | `aictx projects`, `aictx view` |
| Docs | `aictx docs` |

Commands that support structured output accept `--json`:

```bash
aictx check --json
aictx docs --json
```

## MCP tools

MCP is available when the agent client already exposes Aictx MCP tools. Local
MCP exposes exactly:

- `load_memory`
- `search_memory`
- `inspect_memory`
- `save_memory_patch`
- `diff_memory`

Setup, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
stale, and graph workflows are CLI-only in v1. These CLI-only commands are part
of the v1 integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search/inspect behavior; they are not local MCP tool names.

## Docs command

```bash
aictx docs
aictx docs getting-started
aictx docs agent-integration --open
aictx docs --json
```

`aictx docs` lists bundled public docs topics. `aictx docs <topic>` prints the
bundled Markdown for that topic. `--open` opens the hosted page at
`https://docs.aictx.dev`.

## Object types

Object types are `project`, `architecture`, `source`, `synthesis`, `decision`,
`constraint`, `question`, `fact`, `gotcha`, `workflow`, `note`, and `concept`.

`history`, `task-note`, and `feature` are not object types.

Facet categories include `project-description`, `architecture`, `stack`,
`convention`, `file-layout`, `product-feature`, `testing`,
`decision-rationale`, `abandoned-attempt`, `workflow`, `gotcha`,
`debugging-fact`, `source`, `product-intent`, `feature-map`, `roadmap`,
`agent-guidance`, `concept`, `open-question`, `domain`, `bounded-context`,
`capability`, `business-rule`, and `unresolved-conflict`.

## Structured patch

The structured patch is the only write contract.

```json
{
  "source": {
    "kind": "agent",
    "task": "Fix Stripe webhook retries"
  },
  "changes": [
    {
      "op": "create_object",
      "type": "decision",
      "title": "Billing retries moved to queue worker",
      "body": "Stripe webhook retries now happen in the queue worker.",
      "tags": ["billing", "stripe"]
    }
  ]
}
```

Patch operations include `create_object`, `update_object`, `mark_stale`,
`supersede_object`, `delete_object`, `create_relation`, `update_relation`, and
`delete_relation`.

Structured patches are for durable information future agents should know. A
task that produced no durable future value does not need a save.
