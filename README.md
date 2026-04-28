# Aictx

Aictx is local-first project memory for AI coding agents. It stores durable
project context under `.aictx/` as reviewable local files, builds a generated
SQLite index for retrieval, and uses Git for diff, history, and recovery when
the project is inside a Git worktree.

The normal loop is:

```text
load context -> do work -> save memory -> review .aictx changes
```

Aictx does not require a cloud account, embeddings, hosted sync, external model
API, or network access for core memory commands.

## Install

Aictx requires Node.js `>=22`.

Install it in a project:

```bash
pnpm add -D aictx
```

Or with npm:

```bash
npm install --save-dev aictx
```

The package provides two binaries:

* `aictx` for the CLI
* `aictx-mcp` for the MCP stdio server

If installed locally, run commands through your package manager, for example
`pnpm exec aictx init`. The examples below use `aictx` directly.

## CLI Quickstart

Initialize memory storage inside an existing project:

```bash
aictx init
```

In a Git project, Aictx initializes at the Git worktree root. Outside Git, it
initializes in the current directory. It creates `.aictx/` and does not create a
Git commit.

Before a task, load relevant context:

```bash
aictx load "fix Stripe webhook retries"
```

You can pass an explicit token target:

```bash
aictx load "fix Stripe webhook retries" --token-budget 6000
```

`--token-budget` is optional and advisory. It gives Aictx a packaging target,
not a hard limit. If you omit it, Aictx does not truncate context because of a
missing budget.

After meaningful work, save durable project memory with a structured patch:

```bash
aictx save --stdin <<'JSON'
{
  "source": {
    "kind": "agent",
    "task": "Document billing retry behavior"
  },
  "changes": [
    {
      "op": "create_object",
      "type": "note",
      "title": "Billing retries run in the worker",
      "body": "Billing retry execution happens in the queue worker, not inside the HTTP webhook handler."
    }
  ]
}
JSON
```

Review the generated `.aictx/` file changes before committing them. In Git
projects, use:

```bash
aictx diff
```

Other implemented CLI commands include `check`, `rebuild`, `search`, `inspect`,
`stale`, `graph`, `history`, `restore`, and `rewind`. Run `aictx --help` for
the exact command list in your installed build.

## MCP Setup

Configure your MCP client to start `aictx-mcp` from the project root. The MCP
server resolves the project from its current working directory, so use one MCP
server instance per project directory when a client needs multiple projects.

Example command configuration:

```json
{
  "command": "aictx-mcp",
  "cwd": "/path/to/your/project"
}
```

Use MCP first for routine agent memory work:

* `load_memory`
* `search_memory`
* `save_memory_patch`
* `diff_memory`

Use the CLI for setup, maintenance, recovery, inspection, and export-oriented
workflows. MCP-first does not mean MCP-only, and CLI-only capabilities are not
MCP parity gaps.

Agents should use supported MCP tools or CLI commands instead of editing
`.aictx/` files directly unless the user explicitly asks for a direct file edit.

## Capability Map

V1 parity means every supported Aictx capability is reachable to agents through
MCP or CLI. It does not mean MCP and CLI expose identical command lists.

| Capability | MCP | CLI | Notes |
| --- | --- | --- | --- |
| Load task context | `load_memory` | `aictx load` | Preferred routine agent path is MCP. |
| Search memory | `search_memory` | `aictx search` | Preferred routine agent path is MCP. |
| Save memory patch | `save_memory_patch` | `aictx save` | All writes use structured patches. |
| Show memory diff | `diff_memory` | `aictx diff` | Git-backed; CLI fallback is supported. |
| Initialize storage | none | `aictx init` | Setup remains CLI-only in v1. |
| Validate storage | none | `aictx check` | Maintenance remains CLI-only in v1. |
| Rebuild generated index | none | `aictx rebuild` | Maintenance remains CLI-only in v1. |
| Show memory history | none | `aictx history` | Recovery and inspection remain CLI-only in v1. |
| Restore memory | none | `aictx restore` | Recovery remains CLI-only in v1. |
| Rewind memory | none | `aictx rewind` | Recovery remains CLI-only in v1. |
| Inspect object | none | `aictx inspect` | Debug inspection remains CLI-only in v1. |
| List stale memory | none | `aictx stale` | Debug inspection remains CLI-only in v1. |
| Show graph neighborhood | none | `aictx graph` | Debug inspection remains CLI-only in v1. |
| Export Obsidian projection | none | `aictx export obsidian` | Generated projection remains CLI-only in v1. |

CLI-only capabilities should not be added to MCP solely to mirror CLI commands.

## Files And Review

Canonical memory lives in `.aictx/`:

* Markdown files hold human-readable memory bodies.
* JSON sidecars hold structured metadata.
* Relation JSON files describe links between memory objects.
* `events.jsonl` records semantic memory history.
* Generated indexes, context packs, and exports are rebuildable state.

In Git projects, commit useful `.aictx/` changes alongside the code changes they
describe. Aictx never creates Git commits automatically.

## Agent Guidance

Generated guidance files are available for agent setup:

* [Codex skill](integrations/codex/aictx/SKILL.md)
* [Claude guidance](integrations/claude/aictx.md)
* [Generic agent instructions](integrations/generic/aictx-agent-instructions.md)

These files are generated from
[integrations/templates/agent-guidance.md](integrations/templates/agent-guidance.md).
