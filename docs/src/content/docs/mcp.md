---
title: MCP guide
description: Configure Memory MCP and understand the CLI/MCP capability boundary.
---

`memory-mcp` is an MCP stdio server. Configure your MCP client to launch the
global binary, or a project-local binary when the project pins Memory.

Use MCP when your agent client already supports MCP tools and you want routine
Memory actions inside that client. Keep setup, viewer, maintenance,
recovery, registry, docs, wiki, and other operational workflows in the CLI.

:::tip
`memory init` creates local storage; it does not add MCP tools to a running agent
session. Configure the client to launch `memory-mcp`, then start a new session.
:::

## Install

A global install gives the simplest setup:

```bash
npm install -g @aictx/memory
```

The MCP client can launch the global binary:

```bash
memory-mcp
```

With a project-local package install, the client can launch through the project
package manager:

```bash
pnpm exec memory-mcp
npm exec memory-mcp
```

For one-off package resolution, name the scoped package explicitly:

```bash
npx --package @aictx/memory -- memory-mcp
```

For a local binary path, configure the client to launch:

```bash
./node_modules/.bin/memory-mcp
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

Examples:

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
`project_root` selects the initialized project for a tool call:

```text
load_memory({
  project_root: "/path/to/project",
  task: "<task summary>",
  mode: "coding"
})
```

`project_root` is for choosing an initialized local Memory project. It is not arbitrary filesystem access;
reads and writes remain scoped to that project's `.memory/` directory.

## CLI-only work

These workflows stay in the CLI in v1:

- Setup: `memory init`, `memory setup`
- Lenses: `memory lens`
- Branch handoff: `memory handoff`
- Maintenance: `memory check`, `memory rebuild`, `memory reset`, `memory upgrade`
- Recovery: `memory history`, `memory restore`, `memory rewind`
- Export: `memory export obsidian`
- Registry: `memory projects`
- Viewer: `memory view`
- Docs: `memory docs`
- Suggest and audit: `memory suggest`, `memory audit`
- Wiki workflow: `memory wiki`
- Stale inspection: `memory stale`
- Graph inspection: `memory graph`, `memory view` graph screen

Local viewing remains a browser inspection surface, so `memory view` has no MCP
equivalent. Graph inspection is available in the CLI and local viewer, but not
as a local MCP tool.

Future host adapters may expose generic `search` and `fetch` names over Memory
search and inspect behavior. The local MCP server exposes the six Memory-specific
tools above.
