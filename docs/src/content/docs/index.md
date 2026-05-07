---
title: Aictx documentation
description: Public documentation for local-first project memory for AI coding agents.
---

Aictx gives AI coding agents a project memory they can come back to.

Use it when you are tired of re-explaining the same product intent,
architecture decisions, repo conventions, setup steps, and known traps every
time a new chat or agent session starts. Aictx stores that durable context as
local, reviewable files under `.aictx/`, then compiles a focused context pack
for the task in front of the agent.

The everyday loop is small:

```text
load relevant memory -> do the work -> save what future agents should remember
```

Core memory commands do not require a cloud account, embeddings, hosted sync, an
external model API, or network access.

## What Aictx is for

Aictx is local-first project memory for AI coding agents. It is not a chat UI,
an Obsidian clone, or a hosted memory service.

It helps a coding agent answer two questions:

- Before work: what does this agent need to know for this task?
- After work: what should future agents not have to rediscover?

Memory can hold source records, decisions, constraints, facts, gotchas,
workflows, open questions, product concepts, and compact syntheses for areas
such as product intent, feature maps, roadmap, architecture, conventions, and
agent guidance.

:::tip
A good first memory is not a diary of what changed. It is something future
agents can use: "release smoke tests run with `pnpm test:local`", "billing
webhooks retry in the worker", or "the viewer is read-only except Obsidian
export".
:::

## How it works

1. Initialize Aictx inside an existing project with `aictx init`.
2. Load task-focused context with `aictx load "<task summary>"`.
3. Save durable knowledge with `aictx save --stdin` or `save_memory_patch` when
   MCP is already configured.
4. Inspect the result later with `aictx view`, `aictx diff`, Git tools, or MCP
   `diff_memory` when available.

Saved memory is active immediately after Aictx validates and writes it. Aictx
never commits for you.

## Start here

- [Getting started](/getting-started/) gets a project initialized and walks
  through the first load/save/diff loop.
- [Capabilities](/capabilities/) maps the v1 features to the jobs users and
  agents actually need to do.
- [Mental model](/mental-model/) explains canonical memory, generated state,
  object types, and retrieval.
- [Specializing Aictx](/specializing-aictx/) shows how to tailor memory to your
  repo's product intent, workflows, and agent guidance.
- [Agent integration](/agent-integration/) gives agents the concrete workflow
  and guardrails.

## CLI and MCP

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows are CLI-only
in v1. These CLI-only commands are part of the v1 integration model rather than
MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.

## For agents

This site is also published with agent-readable documentation files:

- `/llms.txt`
- `/llms-full.txt`
- `/llms-small.txt`

These files provide compact public documentation for coding agents without
crawling the full website navigation.
