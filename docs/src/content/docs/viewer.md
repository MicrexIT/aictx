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
editing canonical memory files.

The command binds only to `127.0.0.1`, chooses an available random port by
default, and prints a local URL with a per-run API token. It can start outside
an initialized project and open to a Projects dashboard populated from the
user-level registry, plus the current project when the launch directory is
initialized.

## Projects

The registry lives at `$AICTX_HOME/projects.json`, defaulting to
`~/.aictx/projects.json`. It stores project metadata and roots. Canonical memory
stays isolated in each project's own `.aictx/` directory.

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

## Write actions

The viewer is mostly read-only. It has two explicit write actions.

Obsidian export calls the same generated projection service as:

```bash
aictx export obsidian
```

Delete project permanently removes that project's derived `.aictx/` directory
and removes its entry from `$AICTX_HOME/projects.json`. It does not delete
source files.

`aictx view` is a CLI workflow and has no MCP equivalent. Use MCP for routine
agent memory tools; use the viewer when a human wants to inspect local memory.
