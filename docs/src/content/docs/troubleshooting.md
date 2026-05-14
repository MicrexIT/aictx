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

`aictx init` creates local storage. It does not start MCP. MCP tools become
available when the MCP client is configured to launch `aictx-mcp`.

An agent generally cannot start `aictx-mcp` in a shell and then use it as MCP
tools in an already-running session. When MCP tools are not available, the CLI
path provides the same routine memory workflow.

Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory` when the client already exposes Aictx
tools. Setup, lenses, handoff, maintenance, recovery, export, registry, viewer,
docs, suggest, audit, and stale workflows remain CLI-only. Graph inspection is
available in the CLI and local viewer, but remains outside MCP.

Local MCP is the near-term integration path. Remote MCP, hosted sync, cloud
auth, cloud hosting, and ChatGPT App SDK surfaces are future work, and future
`search`/`fetch` adapter names are not local MCP tool names.

:::tip
If you need to keep working right now, use `aictx load` and
`aictx remember --stdin` from the CLI. Configure MCP later in the client
settings.
:::

## Memory is empty after init

`aictx init` creates starter storage. It does not infer a full project memory
model by itself.

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
