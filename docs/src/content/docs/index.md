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

This project is distributed as the npm package `@aictx/memory`. It is unrelated
to similarly named packages in other ecosystems.

## What Aictx is for

Aictx is local-first project memory for AI coding agents. It is not a chat UI,
an Obsidian clone, or a hosted memory service.

It helps a coding agent answer two questions:

- Before work: what does this agent need to know for this task?
- After work: what should future agents not have to rediscover?

Memory can hold source records, decisions, constraints, facts, gotchas,
workflows/how-tos, open questions, product concepts, and compact syntheses for
areas such as product intent, feature maps, roadmap, architecture, conventions,
and agent guidance.

:::tip
A good first memory is not a diary of what changed. It is something future
agents can use: "release smoke tests run with `pnpm test:local`", "billing
webhooks retry in the worker", or "the viewer is read-only except Obsidian
export".
:::

## How it works

1. Set up Aictx inside an existing project with `aictx setup`.
2. Use `aictx lens project-map` for a readable overview.
3. Load task-focused context with `aictx load "<task summary>"`.
4. Save durable knowledge with `aictx remember --stdin` or `remember_memory`
   when MCP is already configured.
5. Inspect the result later in the local viewer with `aictx view`.

Saved memory is active immediately after Aictx validates and writes it. Aictx
never commits for you. As a human, mainly look directly at the viewer.
Use `aictx diff`, Git tools, or MCP `diff_memory` when available for
change review and audit.

## First-time setup prompt

Copy this prompt into [Codex](https://developers.openai.com/codex/cli),
[Claude Code](https://code.claude.com/docs/en/setup),
[Cursor](https://docs.cursor.com/context/rules-for-ai), or another coding
agent from the project root:

```text
Set up fresh Aictx memory for this repository.

First install the current Aictx package globally:
npm install -g @aictx/memory@0.1.30

Then run first-run onboarding, apply the conservative bootstrap memory patch,
and start the local viewer for inspection:
aictx setup --view

Validate memory:
aictx check

Load the first task-focused memory pack:
aictx load "onboard to this repository"

Inspect the readable project map:
aictx lens project-map

When this is done, tell the human to inspect the accepted memory with:
aictx view

Also tell them to review memory changes with:
aictx diff
```

## Start here

- [Getting started](/getting-started/) gets a project initialized and walks
  through the first load/save/diff loop.
- [Capabilities](/capabilities/) maps the v1 features to the jobs users and
  agents actually need to do.
- [Mental model](/mental-model/) explains canonical memory, generated state,
  object types, retrieval, and why Aictx is different from `AGENTS.md` alone,
  vector DB/RAG systems, long context, or plain local files.
- [Specializing Aictx](/specializing-aictx/) shows how to tailor memory to your
  repo's product intent, workflows, and agent guidance.
- [Agent integration](/agent-integration/) gives agents the concrete workflow
  and guardrails.
- [Agent recipes](/agent-recipes/) gives copyable setup and routine-loop
  guidance for Codex, Claude Code, Cursor, Cline, OpenCode, and generic
  MCP-capable agents.

## CLI and MCP

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, lenses,
handoff, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
stale, and graph workflows are CLI-only in v1. These CLI-only commands are part
of the v1 integration model rather than MCP parity gaps.

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

## Project health

The public repository includes contributor guidelines, a code of conduct,
security reporting instructions, support paths, a public roadmap, a release
policy, CI, CodeQL, OpenSSF Scorecard, and Dependabot configuration. See the
repository root for the maintained community and release files.
