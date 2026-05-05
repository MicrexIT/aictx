---
title: MCP guide
description: Configure Aictx MCP and understand the CLI/MCP capability boundary.
---

# MCP guide

`aictx-mcp` is an MCP stdio server. The MCP client must launch it and connect to
its stdin/stdout. An agent generally cannot start `aictx-mcp` in a shell and
then use it as MCP tools in an already-running session.

## Install

The simplest setup is a global install:

```bash
npm install -g @aictx/memory
```

Configure your MCP client to launch:

```bash
aictx-mcp
```

If `aictx-mcp` is not on `PATH`, configure the client to launch it through the
project package manager or local binary path:

```bash
pnpm exec aictx-mcp
npm exec aictx-mcp
./node_modules/.bin/aictx-mcp
npx --package @aictx/memory -- aictx-mcp
```

## Tools

MCP exposes exactly these tools in v1:

- `load_memory`
- `search_memory`
- `save_memory_patch`
- `diff_memory`

Use MCP equivalents only when the client already exposes Aictx MCP tools:

```text
load_memory({ task: "<task summary>", mode: "coding" })
search_memory({ query: "auth route conventions" })
save_memory_patch({ patch: { source, changes } })
diff_memory({})
```

If the MCP server was launched globally rather than from the project root, pass
the target root explicitly:

```text
load_memory({
  project_root: "/path/to/project",
  task: "<task summary>",
  mode: "coding"
})
```

## CLI-only boundaries

The CLI remains the supported path for setup, maintenance, recovery, export,
inspection, registry management, local viewing, suggestion, and audit
operations.

CLI-only capabilities are not MCP parity gaps. Do not add or ask for MCP tools
solely to mirror these CLI commands. In particular, do not add `aictx view` to
MCP. Local viewing is a browser inspection surface, not a routine MCP memory
operation.
