---
title: Troubleshooting
description: Fix common install, PATH, MCP, schema, index, and recovery issues.
---

# Troubleshooting

## `aictx` is not on PATH

Use the package-manager or local-binary form:

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

`aictx init` does not start MCP. Configure your MCP client to launch
`aictx-mcp`.

An agent generally cannot start `aictx-mcp` in a shell and then use it as MCP
tools in an already-running session. If MCP tools are not available, stay on the
CLI path.

Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory` when the client already exposes Aictx
tools. Setup, maintenance, recovery, export, registry, viewer, docs, suggest,
audit, stale, and graph workflows remain CLI-only.

## Memory is empty after init

`aictx init` creates starter storage. It does not infer a full project memory
model by itself.

Run:

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

## Schema or index errors

Validate storage:

```bash
aictx check
```

Rebuild generated indexes:

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

Use:

```bash
aictx diff
```

Plain `git diff -- .aictx/` can omit untracked memory files before staging.
