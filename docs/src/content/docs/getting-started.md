---
title: Getting started
description: Install Aictx, initialize memory, and run the first load/save loop.
---

# Getting started

Aictx works inside an existing project. It writes local, reviewable memory files
under `.aictx/` and keeps generated indexes separate from canonical memory.

## Requirements

Aictx requires Node.js `>=22`.

## Install

Install globally for the simplest CLI and MCP setup:

```bash
npm install -g @aictx/memory
```

Global install is the recommended default for regular CLI use and optional MCP
use. You do not need to add Aictx to each project's `package.json` unless that
project should pin its own Aictx version.

For project-local version pinning:

```bash
pnpm add -D @aictx/memory
npm install -D @aictx/memory
```

If `aictx` is not on `PATH`, run the same commands through the package manager
or local binary:

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

Run this once at the project root:

```bash
aictx init
```

By default, init creates `.aictx/` and updates marked Aictx sections in
`AGENTS.md` and `CLAUDE.md` so coding agents are told to load memory before
non-trivial work and save durable memory after meaningful work.

Use `--no-agent-guidance` when you do not want those repo instruction files
updated.

## First memory loop

Load relevant project memory before non-trivial work:

```bash
aictx load "change auth routes"
```

Do the task. When the work creates durable knowledge future agents should know,
save a structured patch:

```bash
aictx save --stdin
```

Saved memory is active immediately after Aictx validates and writes the patch.
Inspect it asynchronously when needed:

```bash
aictx view
aictx diff
```

Aictx writes local files and never commits automatically.

## Guided setup

For first-run onboarding:

```bash
aictx setup
aictx setup --apply
```

Use `aictx setup` when you want a guided bootstrap preview. Use
`aictx setup --apply` when the conservative bootstrap memory patch should be
applied immediately.
