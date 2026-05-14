---
title: Local viewer
description: Local browser viewer for project memory inspection and explicit project maintenance.
---

`aictx view` starts a local browser viewer for human inspection.

```bash
aictx view
aictx view --open
aictx view --port 4888
aictx view [--port <number>] [--open] [--detach] [--json]
```

Use it when you want to browse memory objects, source-backed syntheses,
relations, project registry entries, and generated Obsidian export state without
editing individual canonical memory objects.

The command binds only to `127.0.0.1`, chooses an available random port by
default, and prints a local URL that includes a per-run API token. It can start
outside an initialized project and opens to a Projects dashboard populated from
the user-level registry, plus the current project when the launch directory is
initialized.

## Projects

The registry lives at `$AICTX_HOME/projects.json`, defaulting to
`~/.aictx/projects.json`. It stores only project metadata and roots. Canonical
memory stays isolated in each project's own `.aictx/` directory.

Project registry commands:

```bash
aictx projects list
aictx projects add
aictx projects add /path/to/project
aictx projects remove <registry-id|project-id|path>
aictx projects prune
```

:::tip
The project registry is for discovery in the viewer. It is not shared memory
and does not make project IDs globally unique.
:::

## Maintenance boundary

The viewer does not edit canonical memory objects or relations. It is not a
hosted app, remote API, MCP tool, Obsidian plugin, or knowledge-management
system.

The viewer has two explicit write actions.

Obsidian export calls the same generated projection service as:

```bash
aictx export obsidian
```

Delete project permanently removes that project's derived `.aictx/` directory
and removes its entry from `$AICTX_HOME/projects.json`. It does not delete
source files.

`aictx view` is CLI-only in v1 and has no MCP equivalent.

## CLI and MCP

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, lenses,
handoff, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
wiki, and stale workflows are CLI-only in v1. Graph inspection is available in the
CLI and this local viewer, but remains outside MCP. These non-MCP surfaces are
part of the v1 integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.
