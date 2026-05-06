---
title: MCP guide
description: Configure Aictx MCP and understand the CLI/MCP capability boundary.
---

`aictx-mcp` is an MCP stdio server. The MCP client must launch it and connect to
its stdin/stdout.

An agent generally cannot start `aictx-mcp` in a shell and then use it as MCP
tools in an already-running session. MCP tools become available through the
client's MCP configuration.

## Install

A global install gives the simplest setup:

```bash
npm install -g @aictx/memory
```

The MCP client can launch the global binary:

```bash
aictx-mcp
```

With a project-local package install, the client can launch through the project
package manager:

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

MCP equivalents are available when the client already exposes Aictx MCP tools:

```text
load_memory({ task: "<task summary>", mode: "coding" })
search_memory({ query: "auth route conventions" })
inspect_memory({ id: "decision.auth-route-conventions" })
save_memory_patch({ patch: { source, changes } })
diff_memory({})
```

When the MCP server was launched globally rather than from the project root,
`project_root` selects the initialized project:

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
are future adapter mappings only. The local MCP server exposes the five
Aictx-specific tools above; generic `search` and `fetch` are not local MCP tool
names.

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

These CLI-only commands are part of the v1 integration model rather than MCP
parity gaps. Local viewing remains a browser inspection surface, not a routine
MCP memory operation, so `aictx view` has no MCP equivalent.
