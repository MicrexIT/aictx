---
title: Install persistent project memory
description: Install Memory, initialize local project memory, and run the first load/save loop for AI coding agents.
---

Memory works inside an existing project. This page gets you to a local `.memory/`
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

A project-local dependency is useful when a repo needs to pin its own Memory
version:

```bash
pnpm add -D @aictx/memory
npm install -D @aictx/memory
```

When `memory` is not on `PATH`, run it through the package manager or local
binary:

```bash
pnpm exec memory check
npm exec memory check
./node_modules/.bin/memory check
npx --package @aictx/memory -- memory check
```

## Initialize a project

From the project root, run:

```bash
memory setup
```

`setup` creates `.memory/` if needed, updates the marked Memory sections in
`AGENTS.md` and `CLAUDE.md`, writes conservative first-run memory from repo
evidence, runs checks, prints role coverage, and starts the local viewer.

Useful setup variants:

```bash
memory setup --dry-run
memory setup --no-view
memory setup --open
```

- `--dry-run` previews setup without writing memory or repo files.
- `--no-view` skips viewer startup for scripts and agent runs.
- `--open` opens the viewer in the default browser after setup.

:::tip
`memory init` is the lower-level empty-storage initializer. Use it for tests,
automation, or manual workflows where you do not want guided setup.
:::

## Run the first memory loop

Load memory before non-trivial work:

```bash
memory load "change auth routes"
```

After work creates durable knowledge for future agents, save it through the
intent-first path:

```bash
memory remember --stdin
```

A task that produced no reusable project knowledge does not need a save.

Inspect memory later:

```bash
memory view
memory diff
```

After setup, a useful retrieval check is:

```bash
memory load "onboard to this repository"
```

:::tip
Use `memory diff` for memory review in Git projects. Plain `git diff -- .memory/`
can miss untracked memory files before they are staged.
:::

## CLI and MCP

Use the CLI for setup and routine work. Add MCP only after your client is
configured to launch `memory-mcp`.

For copyable agent-specific setup prompts, see [Agent recipes](/agent-recipes/).
For exact MCP tool names, see the [MCP guide](/mcp/).
