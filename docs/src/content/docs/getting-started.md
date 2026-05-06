---
title: Getting started
description: Install Aictx, initialize memory, and run the first load/save loop.
---

Aictx works inside an existing project. It writes local, reviewable memory files
under `.aictx/` and keeps generated indexes separate from canonical memory.

## Requirements

Aictx requires Node.js `>=22`.

## Install

A global install gives the simplest CLI and MCP setup:

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

When `aictx` is not on `PATH`, the same commands can run through the package
manager or local binary:

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

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`. Local MCP exposes
exactly `load_memory`, `search_memory`, `inspect_memory`, `save_memory_patch`,
and `diff_memory`.

Local MCP is the near-term integration path; remote/cloud and ChatGPT App SDK
integrations are future work. Future `search`/`fetch` adapter names are not
local MCP tool names.

## Initialize a project

At the project root:

```bash
aictx init
```

By default, init creates `.aictx/` and updates marked Aictx sections in
`AGENTS.md` and `CLAUDE.md` so coding agents are told to load memory before
non-trivial work and save durable memory after meaningful work.

The `--no-agent-guidance` flag leaves those repo instruction files unchanged.

## First memory loop

Task-focused project memory:

```bash
aictx load "change auth routes"
```

After work creates durable knowledge for future agents, save a structured patch:

```bash
aictx save --stdin
```

Saved memory is active immediately after Aictx validates and writes the patch.
The local viewer and diff command are available for asynchronous inspection:

```bash
aictx view
aictx diff
```

Aictx writes local files and never commits automatically.

Setup, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
stale, and graph workflows are CLI-only in v1. These commands are part of the
CLI surface rather than MCP parity gaps.

## Guided setup

For first-run onboarding:

```bash
aictx setup
aictx setup --apply
```

`aictx setup` shows a guided bootstrap preview. `aictx setup --apply` applies
the conservative bootstrap memory patch immediately.
