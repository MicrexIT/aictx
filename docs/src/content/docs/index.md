---
title: Aictx documentation
description: Public documentation for local-first project memory for AI coding agents.
---

# Aictx documentation

Aictx is local-first project memory for AI coding agents.

It stores project facts, decisions, constraints, gotchas, workflows, and
source-backed syntheses that need to survive beyond one chat. Memory lives under
`.aictx/` as reviewable local files and is indexed locally for fast retrieval.

The core loop is:

```text
load memory -> work -> save durable memory
```

Core memory commands do not require a cloud account, embeddings, hosted sync, an
external model API, or network access.

## CLI and MCP

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows are CLI-only
in v1. These CLI-only commands are part of the v1 integration model rather than
MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases, not
local MCP tool names.

## Start here

- [Getting started](/getting-started/) installs Aictx and walks through the first memory loop.
- [Mental model](/mental-model/) explains canonical memory, generated state, and storage layers.
- [Agent integration](/agent-integration/) explains how Aictx fits into an agent workflow.
- [Reference](/reference/) lists commands and the structured patch shape.

## For agents

This site is also published with agent-readable documentation files:

- `/llms.txt`
- `/llms-full.txt`
- `/llms-small.txt`

These files provide compact public documentation for coding agents without
crawling the full website navigation.
