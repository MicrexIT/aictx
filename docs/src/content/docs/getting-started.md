---
title: Getting started
description: Install Aictx, initialize memory, and run the first load/save loop.
---

Aictx works inside an existing project. By the end of this page you will have a
local `.aictx/` directory, repo-level agent guidance, and the commands for the
first memory loop.

## What you need

- Node.js `>=22`
- A project directory where you want AI coding agents to remember durable
  project context

Check Node with:

```bash
node --version
```

## Install

Install globally for the simplest CLI and MCP setup:

```bash
npm install -g @aictx/memory
```

Global install is the recommended default for regular CLI use and optional MCP
use. A project-local dependency is only needed when a project should pin its own
Aictx version.

For project-local version pinning:

```bash
pnpm add -D @aictx/memory
npm install -D @aictx/memory
```

When `aictx` is not on `PATH`, run commands through the package manager or local
binary:

```bash
pnpm exec aictx init
npm exec aictx init
./node_modules/.bin/aictx init
```

For one-off execution without a global or local install:

```bash
pnpm --package @aictx/memory dlx aictx init
npx --package @aictx/memory -- aictx init
```

## Initialize a project

From the project root:

```bash
aictx init
```

`init` creates `.aictx/` and, by default, updates marked Aictx sections in
`AGENTS.md` and `CLAUDE.md`. Those sections tell coding agents to load memory
before non-trivial work and make a save/no-save decision after meaningful work.

Use `--no-agent-guidance` when you want to leave those instruction files
unchanged.

:::tip
`aictx init` creates starter storage. It does not try to understand your whole
project from scratch. Use the setup flow next when you want Aictx to seed useful
first-run memory from existing repo evidence.
:::

## Seed first-run memory

For guided onboarding:

```bash
aictx setup
aictx setup --apply
```

`aictx setup` previews a conservative bootstrap memory patch. `aictx setup
--apply` applies it immediately.

If you want to inspect the patch file manually:

```bash
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
```

This is the right path when memory feels empty after `init`, or when you want
source-backed product intent, feature map, roadmap, architecture, conventions,
and agent guidance syntheses without hand-writing JSON.

## Run the first memory loop

Load memory before non-trivial work:

```bash
aictx load "change auth routes"
```

After work creates durable knowledge for future agents, save intent-first memory:

```bash
aictx remember --stdin
```

Saved memory is active immediately after Aictx validates and writes it. A task
that produced no reusable project knowledge does not need a save.

Inspect memory later:

```bash
aictx view
aictx diff
```

:::tip
Use `aictx diff` for memory review in Git projects. Plain `git diff -- .aictx/`
can miss untracked memory files before they are staged.
:::

## CLI and MCP

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows are CLI-only
in v1. These CLI-only commands are part of the v1 integration model rather than
MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.
