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

Configure your MCP client to launch the global binary:

```bash
aictx-mcp
```

If the project has a local package install, configure the client to launch
through the project package manager:

```bash
pnpm exec aictx-mcp
npm exec aictx-mcp
```

For one-off package resolution, name the scoped package explicitly:

```bash
npx --package @aictx/memory -- aictx-mcp
```

For a local binary path, configure the client to launch:

```bash
./node_modules/.bin/aictx-mcp
```

MCP uses stdout for the protocol. Startup diagnostics and failures are written
to stderr.

## Tools

MCP exposes exactly these tools in v1:

- `load_memory`
- `search_memory`
- `inspect_memory`
- `save_memory_patch`
- `diff_memory`

Use MCP equivalents only when the client already exposes Aictx MCP tools:

```text
load_memory({ task: "<task summary>", mode: "coding" })
search_memory({ query: "auth route conventions" })
inspect_memory({ id: "decision.auth-route-conventions" })
save_memory_patch({ patch: { source, changes } })
diff_memory({})
```

If the MCP server was launched globally rather than from the project root, pass
the target project root explicitly:

```text
load_memory({
  project_root: "/path/to/project",
  task: "<task summary>",
  mode: "coding"
})
```

`project_root` selects an initialized local Aictx project for the tool call. It
is not arbitrary filesystem access; reads and writes remain scoped to the
resolved project's `.aictx/` directory.

## CLI-only boundaries

The CLI remains the supported path for setup, maintenance, recovery, export,
registry management, local viewing, suggestion, and audit operations. Stale
lists and graph neighborhoods also remain CLI-only.

CLI-only capabilities are not MCP parity gaps. Do not add or ask for MCP tools
solely to mirror these CLI commands. In particular, do not add `aictx view` to
MCP. Local viewing is a browser inspection surface, not a routine MCP memory
operation.
