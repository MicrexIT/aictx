---
title: MCP guide
description: Configure Aictx MCP and understand the CLI/MCP capability boundary.
---

`aictx-mcp` is an MCP stdio server. Configure your MCP client to launch the
global binary, or a project-local binary when the project pins Aictx.

MCP is useful when the agent client already supports MCP tools. The CLI and
local viewer remain the default path for routine memory work, graph inspection,
and all setup, lenses, handoff, maintenance, recovery, viewer, docs,
suggestion, audit, and stale workflows.

:::tip
`aictx init` does not start MCP. Starting `aictx-mcp` in a shell usually cannot
add MCP tools to an already-running agent session. Configure the client first,
then start a new session.
:::

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
- `remember_memory`
- `save_memory_patch`
- `diff_memory`

MCP equivalents are available when the client already exposes Aictx MCP tools:

```text
load_memory({ task: "<task summary>", mode: "coding" })
search_memory({ query: "auth route conventions" })
inspect_memory({ id: "decision.auth-route-conventions" })
remember_memory({
  task: "<task summary>",
  memories: [{ kind: "fact", title: "Durable fact", body: "Reusable project context." }]
})
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

## CLI-only boundaries

Setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs,
suggest, audit, and stale workflows are CLI-only in v1. Graph inspection is
available in the CLI and local viewer, but remains outside MCP:

- Setup: `aictx init`, `aictx setup`
- Lenses: `aictx lens`
- Branch handoff: `aictx handoff`
- Maintenance: `aictx check`, `aictx rebuild`, `aictx reset`, `aictx upgrade`
- Recovery: `aictx history`, `aictx restore`, `aictx rewind`
- Export: `aictx export obsidian`
- Registry: `aictx projects`
- Viewer: `aictx view`
- Docs: `aictx docs`
- Suggest and audit: `aictx suggest`, `aictx audit`
- Stale inspection: `aictx stale`
- Graph inspection: `aictx graph`, `aictx view` graph screen

These non-MCP surfaces are part of the v1 integration model rather than MCP
parity gaps. Local viewing remains a browser inspection surface, not a routine
MCP memory operation, so `aictx view` has no MCP equivalent.

Future ChatGPT-compatible or other host adapters may expose generic `search`
and `fetch` names as aliases over Aictx search and inspect behavior. Those names
are future adapter mappings only. The local MCP server exposes the six
Aictx-specific tools above; generic `search` and `fetch` are not local MCP tool
names.

Local MCP is the near-term integration path for MCP-capable local agent
harnesses. Remote MCP endpoints, hosted sync, cloud APIs, OAuth or cloud-auth
surfaces, tenancy layers, billing surfaces, and ChatGPT App SDK UI remain
future work.
