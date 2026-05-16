---
title: CLI guide
description: Setup, routine work, inspection, recovery, export, docs, and viewer commands.
---

The CLI is the default way to use Aictx. It handles setup, routine memory work,
inspection, recovery, exports, bundled docs, and the local viewer.

Most days, an agent only needs:

```bash
aictx load "task summary"
aictx remember --stdin
aictx diff
```

The rest of the CLI is there for setup, review, recovery, and maintenance.

## Quick checks

```bash
aictx check
aictx diff
aictx view --open
```

- `check` validates canonical memory and generated index health.
- `diff` shows memory changes, including untracked files in Git projects.
- `view --open` starts the local browser viewer.

## Setup and bootstrap

```bash
aictx init
aictx setup
aictx setup --dry-run
aictx setup --no-view
aictx setup --open
aictx patch review bootstrap-memory.json
```

- `setup` is the normal onboarding command. It initializes storage if needed,
  applies conservative bootstrap memory, and starts the local viewer unless
  told not to.
- `init` creates empty storage for automation, tests, and manual workflows.
- `setup --dry-run` previews setup without writing memory or repo files.
- `setup --force --dry-run` previews reset/setup behavior without deleting or
  rewriting anything.
- `setup --no-view` skips viewer startup; `setup --open` also opens the viewer
  in the default browser.
- `patch review` reviews a structured memory patch without writing it.

:::tip
If memory is empty after `init`, use `aictx setup` before hand-writing memory.
The bootstrap flow is designed for that first-run gap.
:::

## Routine memory work

```bash
aictx load "change auth routes"
aictx search "auth route conventions"
aictx inspect decision.auth-route-conventions
aictx suggest --after-task "change auth routes" --json
aictx audit --json
aictx remember --stdin
```

The routine loop is narrow: load context, do the work, and save durable
knowledge as active memory. A task that produced no reusable project knowledge
does not need a save.

Use `remember` for normal intent-first memory creation. Use `save` only when
you need to submit a structured patch directly. In
`suggest --after-task --json`, use `recommended_actions` as advice; the agent
still writes the meaningful title, body, and reason from current evidence.

## Wiki-style source workflows

```bash
aictx wiki ingest --stdin
aictx wiki ingest --stdin --dry-run --json
aictx wiki file --stdin
aictx wiki lint --json
aictx wiki log --limit 20
```

`wiki ingest` creates or updates a source record with `origin` and files
agent-supplied syntheses in the same atomic patch. `wiki file` saves a useful
query result or synthesis through the intent-first remember path. `wiki lint`
uses audit semantics with wiki wording, and `wiki log` renders a chronological
view from canonical events.

Commands that support structured output accept `--json`:

```bash
aictx check --json
```

## Inspection and debugging

```bash
aictx stale
aictx graph <id>
aictx lens project-map
aictx lens current-work
aictx handoff show
```

`audit` includes role coverage gaps, but missing roles are not `check`
failures. `stale` lists stale and superseded memory. `graph` shows a one-hop
relation neighborhood. `lens` renders readable project views. `handoff`
preserves unfinished current-branch state without making it project truth.

## Maintenance

```bash
aictx check
aictx rebuild
aictx upgrade
aictx reset
aictx reset --all
```

`rebuild` regenerates indexes from canonical memory. `reset` backs up and clears
local `.aictx/` storage. `reset --all` resets every project in the user-level
registry; add `--destroy` only when you intend to delete each registered
`.aictx/` without backup.

## Git inspection and recovery

```bash
aictx diff
aictx history
aictx restore <commit>
aictx rewind
```

Aictx writes local files and never commits automatically. Git remains the source
of truth for history and rollback when the project is inside a Git worktree.

## Export, viewer, and docs

```bash
aictx export obsidian
aictx projects list
aictx view --open
aictx docs
aictx docs getting-started
aictx docs demand-driven-memory
aictx docs agent-recipes
aictx docs agent-integration --open
```

`view` starts a local memory viewer. `docs` lists bundled public docs topics.
`docs <topic>` prints bundled Markdown for that topic. `--open` opens the
hosted docs site.

## MCP

MCP is available when the agent client has launched and connected to
`aictx-mcp`. Use the [MCP guide](/mcp/) for configuration and exact tool
boundaries.
