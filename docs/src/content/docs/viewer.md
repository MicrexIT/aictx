---
title: Local viewer
description: Use the read-only local browser viewer to inspect project memory.
---

# Local viewer

`aictx view` starts a local, read-only browser viewer for human inspection.

```bash
aictx view
aictx view --open
aictx view --port 4888
aictx view --json
```

The command binds only to `127.0.0.1`, chooses an available random port by
default, and prints a local URL that includes a per-run API token. It can start
outside an initialized project and opens to a Projects dashboard populated from
the user-level registry, plus the current project when the launch directory is
initialized.

## Projects

The registry lives at `$AICTX_HOME/projects.json`, defaulting to
`~/.aictx/projects.json`. It stores only project metadata and roots. Canonical
memory stays isolated in each project's own `.aictx/` directory.

Use:

```bash
aictx projects list
aictx projects add
aictx projects add /path/to/project
aictx projects remove <registry-id|project-id|path>
aictx projects prune
```

## Read-only boundary

The viewer does not edit canonical memory. It is not a hosted app, remote API,
MCP tool, Obsidian plugin, or knowledge-management system.

The only write action in the viewer is the explicit Obsidian export screen,
which calls the same generated projection service as:

```bash
aictx export obsidian
```

That export writes generated projection files only.

`aictx view` is CLI-only in v1. CLI-only capabilities are not MCP parity gaps.
Do not add `aictx view` to MCP.

Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows remain
CLI-only.
