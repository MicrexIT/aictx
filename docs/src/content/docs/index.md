---
title: Aictx documentation
description: Public documentation for local-first project memory for AI coding agents.
---

Aictx gives coding agents a project memory they can return to.

Use it when a new coding session should not need the same briefing again:
product intent, architecture choices, repo conventions, setup steps, known
traps, and useful source-backed summaries. Aictx stores that context as local,
reviewable files under `.aictx/`, then builds a focused memory pack for the
task in front of the agent.

The daily loop is small:

```text
load relevant memory -> do the work -> save what future agents should remember
```

Core memory commands run locally. They do not require a cloud account,
embeddings, hosted sync, external model API, or network access.

This project is distributed as the npm package `@aictx/memory`. It is unrelated
to similarly named packages in other ecosystems.

## What Aictx is for

Aictx is for durable project context that should survive across agents,
sessions, branches, and reviews.

It helps a coding agent answer two questions:

- Before work: what matters for this task?
- After work: what should future agents not have to rediscover?

Good memory is useful on a later day. It can capture a decision, a workflow, a
gotcha, an open question, a source record, or a compact synthesis of a larger
area such as product intent, architecture, feature maps, conventions, roadmap,
or agent guidance.

:::tip
A good first memory is something future agents can use: "release smoke tests run
with `pnpm test:local`", "billing webhooks retry in the worker", or "the viewer
can inspect memory and export Obsidian projections".
:::

## How it works

1. The agent loads task-focused project memory.
2. The agent does the work using the repo, tests, and conversation as evidence.
3. The agent saves only durable context that should be active next time.

Aictx keeps that memory local, explicit, and reviewable.

## First-time setup prompt

Copy this prompt into [Codex](https://developers.openai.com/codex/cli),
[Claude Code](https://code.claude.com/docs/en/setup),
[Cursor](https://docs.cursor.com/context/rules-for-ai), or another coding
agent from the project root:

```text
Set up fresh Aictx memory for this repository.

Run:
npm install -g @aictx/memory
aictx setup
aictx check
aictx load "onboard to this repository"

When this is done, report:
- whether setup wrote memory
- whether check passed
- how I can inspect the result with `aictx view` or `aictx diff`
```

## Start here

- [Getting started](/getting-started/) installs Aictx, initializes a repo, and
  walks through the first load/save/diff loop.
- [Capabilities](/capabilities/) maps the main commands to the jobs users and
  agents actually need to do.
- [Mental model](/mental-model/) explains canonical memory, generated state,
  retrieval, and how Aictx fits beside agent instruction files.
- [Wiki workflow](/wiki-workflow/) covers source-backed ingestion and maintained
  syntheses.
- [Specializing Aictx](/specializing-aictx/) shows how to shape memory for your
  repo's product, workflows, and agent guidance.
- [Agent integration](/agent-integration/) gives agents the concrete workflow
  and safety rules.
- [Agent recipes](/agent-recipes/) gives copyable setup prompts for Codex,
  Claude Code, Cursor, Cline, OpenCode, and MCP-capable clients.

## CLI and MCP

Use the CLI by default. Configure MCP when your agent client already supports
tool servers and you want the routine load/search/inspect/save/diff actions
inside the client.

For exact tool names and boundaries, see the [MCP guide](/mcp/) and
[Reference](/reference/).

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
