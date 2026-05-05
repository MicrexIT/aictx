---
title: Reference
description: Compact CLI, MCP, docs, object taxonomy, and structured patch reference.
---

# Reference

## CLI commands

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

Use `--json` on commands that support structured output:

```bash
aictx check --json
aictx docs --json
```

## MCP tools

MCP exposes exactly:

- `load_memory`
- `search_memory`
- `save_memory_patch`
- `diff_memory`

CLI-only capabilities are not MCP parity gaps.

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

Do not create `history`, `task-note`, or `feature` object types.

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

Save only durable information future agents should know. Save nothing when the
task produced no durable future value.
