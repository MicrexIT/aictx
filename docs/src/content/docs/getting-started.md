---
title: Getting started
description: Install Aictx, initialize memory, and run the first load/save loop.
---

Aictx works inside an existing project. This page gets you to a local `.aictx/`
directory, short repo-level agent guidance, and the first memory loop.

## What you need

- Node.js `>=22`
- A project directory where coding agents should remember durable project
  context

Check Node with:

```bash
node --version
```

## Install

Install globally for the simplest CLI and optional MCP setup:

```bash
npm install -g @aictx/memory
```

A project-local dependency is useful when a repo needs to pin its own Aictx
version:

```bash
pnpm add -D @aictx/memory
npm install -D @aictx/memory
```

When `aictx` is not on `PATH`, run it through the package manager or local
binary:

```bash
pnpm exec aictx check
npm exec aictx check
./node_modules/.bin/aictx check
npx --package @aictx/memory -- aictx check
```

## Initialize a project

From the project root, run:

```bash
aictx setup
```

`setup` creates `.aictx/` if needed, updates the marked Aictx sections in
`AGENTS.md` and `CLAUDE.md`, writes conservative first-run memory from repo
evidence, runs checks, prints role coverage, and starts the local viewer.

Useful setup variants:

```bash
aictx setup --dry-run
aictx setup --no-view
aictx setup --open
```

- `--dry-run` previews setup without writing memory or repo files.
- `--no-view` skips viewer startup for scripts and agent runs.
- `--open` opens the viewer in the default browser after setup.

:::tip
`aictx init` is the lower-level empty-storage initializer. Use it for tests,
automation, or manual workflows where you do not want guided setup.
:::

## Run the first memory loop

Load memory before non-trivial work:

```bash
aictx load "change auth routes"
```

After work creates durable knowledge for future agents, save it through the
intent-first path:

```bash
aictx remember --stdin
```

A task that produced no reusable project knowledge does not need a save.

Inspect memory later:

```bash
aictx view
aictx diff
```

After setup, a useful retrieval check is:

```bash
aictx load "onboard to this repository"
```

:::tip
Use `aictx diff` for memory review in Git projects. Plain `git diff -- .aictx/`
can miss untracked memory files before they are staged.
:::

## CLI and MCP

Use the CLI for setup and routine work. Add MCP only after your client is
configured to launch `aictx-mcp`.

For copyable agent-specific setup prompts, see [Agent recipes](/agent-recipes/).
For exact MCP tool names, see the [MCP guide](/mcp/).
