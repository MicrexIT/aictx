---
title: Troubleshooting
description: Fix common install, PATH, MCP, schema, index, and recovery issues.
---

Start with the smallest check that answers the question:

```bash
memory check
memory diff
memory view --open
```

`check` validates storage and index health. `diff` shows memory changes. `view`
opens the local inspection UI.

## `memory` is not on PATH

Package-manager and local-binary forms work without a global `PATH` entry:

```bash
pnpm exec memory check
npm exec memory check
./node_modules/.bin/memory check
```

For one-off execution:

```bash
npx --package @aictx/memory -- memory check
```

If a project-local install is stale, update it or use a current global/source
binary before trusting schema errors.

## MCP tools are not available

`memory init` creates local storage. It does not add MCP tools to an already
running agent session. MCP tools become available when the client is configured
to launch `memory-mcp`.

If you need to keep working right now, use the CLI:

```bash
memory load "<task summary>"
memory remember --stdin
memory diff
```

Configure MCP later in the client settings, then start a new agent session. See
the [MCP guide](/mcp/) for exact tool names and CLI-only boundaries.

## Memory is empty after init

`memory init` creates starter storage. It does not create a full project memory
map by itself.

Guided setup:

```bash
memory setup
```

or ask for a bootstrap patch:

```bash
memory suggest --bootstrap --patch > bootstrap-memory.json
memory patch review bootstrap-memory.json
memory save --file bootstrap-memory.json
memory check
```

The bootstrap path is best for first-run product intent, feature map, roadmap,
architecture, conventions, and agent guidance memory.

## Schema or index errors

Storage validation:

```bash
memory check
```

Generated index rebuild:

```bash
memory rebuild
```

`rebuild` does not change canonical memory.

## Dirty memory warnings

Dirty or untracked `.memory/` files are not by themselves a reason to skip saving
durable memory. Review the files, then use supported CLI/MCP save paths when
there is durable future value. Memory backs up dirty touched files under
`.memory/recovery/` before overwrite/delete and continues where possible.

## Git diff misses new memory files

The Memory diff includes tracked and untracked memory files:

```bash
memory diff
```

Plain `git diff -- .memory/` can omit untracked memory files before staging.
