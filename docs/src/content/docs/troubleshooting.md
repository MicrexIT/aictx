---
title: Troubleshooting
description: Fix common install, PATH, MCP, schema, index, and recovery issues.
---

Start with the smallest check that answers the question:

```bash
aictx check
aictx diff
aictx view --open
```

`check` validates storage and index health. `diff` shows memory changes. `view`
opens the local inspection UI.

## `aictx` is not on PATH

Package-manager and local-binary forms work without a global `PATH` entry:

```bash
pnpm exec aictx check
npm exec aictx check
./node_modules/.bin/aictx check
```

For one-off execution:

```bash
npx --package @aictx/memory -- aictx check
```

If a project-local install is stale, update it or use a current global/source
binary before trusting schema errors.

## MCP tools are not available

`aictx init` creates local storage. It does not add MCP tools to an already
running agent session. MCP tools become available when the client is configured
to launch `aictx-mcp`.

If you need to keep working right now, use the CLI:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

Configure MCP later in the client settings, then start a new agent session. See
the [MCP guide](/mcp/) for exact tool names and CLI-only boundaries.

## Memory is empty after init

`aictx init` creates starter storage. It does not create a full project memory
map by itself.

Guided setup:

```bash
aictx setup
```

or ask for a bootstrap patch:

```bash
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
```

The bootstrap path is best for first-run product intent, feature map, roadmap,
architecture, conventions, and agent guidance memory.

## Schema or index errors

Storage validation:

```bash
aictx check
```

Generated index rebuild:

```bash
aictx rebuild
```

`rebuild` does not change canonical memory.

## Dirty memory warnings

Dirty or untracked `.aictx/` files are not by themselves a reason to skip saving
durable memory. Review the files, then use supported CLI/MCP save paths when
there is durable future value. Aictx backs up dirty touched files under
`.aictx/recovery/` before overwrite/delete and continues where possible.

## Git diff misses new memory files

The Aictx diff includes tracked and untracked memory files:

```bash
aictx diff
```

Plain `git diff -- .aictx/` can omit untracked memory files before staging.
