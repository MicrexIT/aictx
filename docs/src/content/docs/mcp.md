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

Local MCP exposes exactly these tools in v1:

- `load_memory`
- `search_memory`
- `inspect_memory`
- `save_memory_patch`
- `diff_memory`

Local MCP is the near-term integration path for MCP-capable local agent
harnesses. Remote MCP endpoints, hosted sync, cloud APIs, OAuth or cloud-auth
surfaces, tenancy layers, billing surfaces, and ChatGPT App SDK UI remain
future work.

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

Future ChatGPT-compatible or other host adapters may expose generic `search`
and `fetch` names as aliases over Aictx search and inspect behavior. Those names
are future adapter mappings only. The local MCP server must not register
`search` or `fetch`; it exposes the five Aictx-specific tools above.

## CLI-only boundaries

The CLI remains the supported path for setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows:

- Setup: `aictx init`, `aictx setup`
- Maintenance: `aictx check`, `aictx rebuild`, `aictx reset`, `aictx upgrade`
- Recovery: `aictx history`, `aictx restore`, `aictx rewind`
- Export: `aictx export obsidian`
- Registry: `aictx projects`
- Viewer: `aictx view`
- Docs: `aictx docs`
- Suggest and audit: `aictx suggest`, `aictx audit`
- Stale and graph inspection: `aictx stale`, `aictx graph`

CLI-only capabilities are not MCP parity gaps. Do not add or ask for MCP tools
solely to mirror these CLI commands. In particular, do not add `aictx view` to
MCP. Local viewing is a browser inspection surface, not a routine MCP memory
operation.
