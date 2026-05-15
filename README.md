# Aictx

![Stop re-explaining your repo to AI agents. Aictx saves durable project knowledge as reviewable repo memory.](site/public/assets/readme-value-header.png)

<p align="center">
  <a href="https://aictx.dev"><img alt="Website" src="https://img.shields.io/badge/website-aictx.dev-111214?style=for-the-badge"></a>
  <a href="https://docs.aictx.dev"><img alt="Docs" src="https://img.shields.io/badge/docs-read-111214?style=for-the-badge"></a>
  <a href="https://demo.aictx.dev/?token=demo"><img alt="Live demo" src="https://img.shields.io/badge/demo-viewer-111214?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/aictx/memory/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/aictx/memory/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/aictx/memory/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/aictx/memory/actions/workflows/codeql.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@aictx/memory"><img alt="npm" src="https://img.shields.io/npm/v/@aictx/memory"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
</p>

Aictx is local-first project memory for AI coding agents, inspired by
[Andrej Karpathy's LLM Wiki pattern](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md):
durable, human-editable project knowledge that models can read before work.

Stop re-explaining the same product intent, architecture decisions, repo
conventions, setup steps, and known traps every time a new AI coding session
starts. Activate Aictx once in a repo: it saves durable knowledge as local,
reviewable memory, wires short agent guidance into the project, and loads only
the pieces that matter for the current task.

Use it when you want:

- New agents to understand the repo without a long briefing.
- Durable decisions, workflows, gotchas, and source-backed summaries to survive
  across sessions, branches, and reviews.
- Local files and Git review instead of hosted memory, a vector database, or
  another prompt you have to manually keep current.

This repository publishes the npm package `@aictx/memory`. It is unrelated to
similarly named packages in other ecosystems.

## Why Aictx?

Aictx is for durable project context that should survive between agents,
sessions, branches, and reviews without making you re-teach the repo each time.

- Why not `AGENTS.md` only? Agent instruction files are good operating manuals,
  but they become too broad and static when they also try to hold product
  intent, decisions, gotchas, workflows, and source-backed summaries.
- Why not a vector DB or RAG stack? Those are useful for large retrieval
  systems. Aictx keeps v1 project memory local, inspectable, Git-aware, and
  usable without embeddings, hosted infrastructure, or a model API.
- Why not long context? Long context helps inside one session. It does not make
  memory reviewable, current, reusable across future sessions, or easy to clean
  up when facts go stale.
- Why local files? Plain files are reviewable and portable. Aictx builds on that
  foundation with validation, typed memory, a local index, task-focused loading,
  relation-aware inspection, and a save/no-save discipline.

### Inspect the Memory

Aictx is not just a hidden context file for agents. The visual memory viewer is
part of the product: a local review surface where humans can inspect the same
schema, objects, facets, relations, provenance, and graph context agents load.

<p align="center">
  <a href="https://demo.aictx.dev/?token=demo">
    <img
      alt="Aictx viewer showing the memory schema graph with relation overview and canonical storage navigation."
      src="site/public/assets/readme-visual-memory.png"
      width="940"
    >
  </a>
  <br>
  <sub>Schema, stored objects, relation provenance, and graph context in one inspectable local viewer.</sub>
</p>

## What Gets Stored

| Memory | Use it for |
| --- | --- |
| `decision` / `constraint` | Choices and boundaries future agents should respect. |
| `workflow` / `gotcha` | Repeatable procedures and known traps. |
| `source` | Where important project facts came from. |
| `synthesis` | Compact summaries of product intent, architecture, feature maps, conventions, and agent guidance. |
| `question` / `fact` / `concept` | Open scope, reusable facts, and domain ideas. |

Aictx does not require a cloud account, embeddings, hosted sync, an external
model API, or network access for core memory commands. Saved memory is active
immediately after Aictx validates and writes it.

## How It Works

![Aictx workflow: load relevant memory, do work, and remember durable knowledge.](site/public/assets/readme-how-it-works.png)

```text
set up once -> agents load relevant reminders -> save durable discoveries
```

The loop is deliberately small after setup. Agents load memory before
non-trivial work, use the current repo and tests as evidence, then save only
knowledge that should survive future sessions, branches, and reviews.

## Get Started Quickly

Aictx requires Node.js `>=22`. Core commands run locally; no cloud account,
model API, embeddings, or hosted sync are required.

```bash
npm install -g @aictx/memory
cd path/to/your/repo
aictx setup
aictx load "onboard to this repository"
aictx view
```

`aictx setup` activates Aictx in the current repo. It creates local `.aictx/`
memory, updates the marked Aictx sections in `AGENTS.md` and `CLAUDE.md`, writes
conservative first-run memory, runs checks, and starts the local viewer. Use
`aictx setup --no-view` when you do not want the viewer to start, or
`aictx setup --dry-run` to preview before writing.

Aictx writes local files and never commits automatically.

## Ask an Agent to Activate It

Paste this into Codex, Claude Code, OpenCode, Cursor, Cline, or another
CLI-capable coding agent from the project root:

```text
Set up Aictx memory for this repository.

Run:
npm install -g @aictx/memory
aictx setup
aictx check
aictx load "onboard to this repository"

When this is done, report:
- whether setup wrote memory
- whether check passed
- how I can inspect the result with `aictx view` or `aictx diff`
```

After setup, the normal agent loop is small:

```bash
aictx load "<task summary>"
# do the work
aictx remember --stdin
aictx diff
```

Save only durable project knowledge. Aictx is meant to reduce repeated context
work, not archive every task transcript.

## What You Get

Four surfaces ship today. Each one works locally and fits normal Git review.

| Surface | What it gives agents and humans | Try |
| --- | --- | --- |
| One-time setup | Creates local memory and short repo guidance so future agents know when to load and save context. | `aictx setup` |
| Task-focused loading | Pulls relevant project memory before coding, debugging, review, architecture, or onboarding work. | `aictx load "change auth routes"` |
| Visual memory viewer | Opens a local browser for the memory schema, canonical objects, facets, relation overview, provenance, and graph context. | `aictx view` |
| Save discipline | Saves only durable facts, decisions, workflows, gotchas, source records, and syntheses. | `aictx remember --stdin` |

## Works With Your Agent

| Agent or client | Fastest path |
| --- | --- |
| Codex | `aictx setup` writes `AGENTS.md`; use the CLI loop by default. |
| Claude Code | `aictx setup` writes `CLAUDE.md`; use the CLI loop by default. |
| OpenCode | Uses the root `AGENTS.md` guidance created by setup. |
| Cursor | Copy `integrations/cursor/aictx.mdc` into `.cursor/rules/aictx.mdc`, then run setup. |
| Cline | Copy `integrations/cline/aictx.md` into `.clinerules/aictx.md`, then run setup. |
| MCP-capable clients | Start with the CLI; configure `aictx-mcp` later when the client exposes MCP tools. |

## Distribution Artifacts

The `integrations/` directory also includes PR-ready distribution artifacts for
agent marketplaces. Use `integrations/codex/skills/aictx-memory/` for a Codex
standalone skill, `integrations/codex/plugins/aictx-memory/` for the Codex
plugin format, and `integrations/claude/plugins/aictx-memory/` for the Claude
Code plugin format. These package the same CLI-first guidance as the setup aids;
they do not add MCP configuration.

Marketplace commands target a marketplace root, not a raw plugin directory. Once
a marketplace catalog points at the generated Aictx plugin artifact, Codex users
can add and maintain that marketplace with:

```bash
codex plugin marketplace add owner/repo
codex plugin marketplace add owner/repo --ref main
codex plugin marketplace add https://github.com/example/plugins.git --sparse .agents/plugins
codex plugin marketplace add ./local-marketplace-root

codex plugin marketplace upgrade
codex plugin marketplace upgrade marketplace-name
codex plugin marketplace remove marketplace-name
```

Claude Code users can add the marketplace from inside Claude Code and then
install the plugin from that marketplace:

```text
/plugin marketplace add owner/repo
/plugin marketplace add ./local-marketplace-root
/plugin install aictx-memory@marketplace-name
/plugin marketplace list
/plugin marketplace update
/plugin marketplace remove marketplace-name
```

For Claude Code scripting, use the equivalent CLI form:

```bash
claude plugin marketplace add owner/repo
claude plugin marketplace add owner/repo@main
claude plugin marketplace add https://github.com/example/plugins.git
claude plugin marketplace add ./local-marketplace-root
claude plugin marketplace add owner/repo --scope project
claude plugin marketplace add owner/monorepo --sparse .claude-plugin plugins
claude plugin marketplace list
claude plugin marketplace list --json
claude plugin marketplace update
claude plugin marketplace update marketplace-name
claude plugin marketplace remove marketplace-name
```

## Reference Contracts

Object types are `project`, `architecture`, `decision`, `constraint`,
`question`, `fact`, `gotcha`, `workflow`, `note`, `concept`, `source`, and
`synthesis`. Do not create invalid `history`, `task-note`, or `feature` object
types. Use `workflow` for project-specific how-to procedures, command
sequences, release/debugging paths, verification routines, and maintenance
steps.

Load durable project context narrowly before non-trivial work. Save only durable
memory. Do not save secrets. Prefer updating stale memory, superseding, or
deleting existing memory over creating duplicates. Prefer the current user
request, current code, and tests over loaded memory when they conflict; also
prefer current code when old memory conflicts with the user request. Report
whether Aictx memory changed, mention async inspection, and save nothing when
there is no durable future value.

Load modes are `coding`, `debugging`, `review`, `architecture`, and
`onboarding`. Modes tune deterministic ranking and rendering; they do not broaden
project scope, call a model, use external retrieval, or load the whole project.

If `aictx` is not on `PATH`, run commands through the package manager or local
binary:

```bash
pnpm exec aictx init
npm exec aictx init
./node_modules/.bin/aictx init
npx --package @aictx/memory -- aictx init
```

For MCP fallbacks:

```bash
pnpm exec aictx-mcp
npm exec aictx-mcp
./node_modules/.bin/aictx-mcp
npx --package @aictx/memory -- aictx-mcp
```

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory` in v1.

Setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs,
suggest, audit, wiki, and stale workflows remain outside local MCP. Non-MCP
capabilities are not MCP parity gaps. Do not add or ask for MCP tools solely to
mirror these CLI commands, and do not work around supported commands by editing
`.aictx/` files directly. Graph inspection is available in the CLI and local viewer, but remains outside local MCP.

Local MCP is the near-term integration path. Remote MCP and ChatGPT App SDK are
future work. Future `search`/`fetch` names are adapter aliases over Aictx
search/inspect behavior, not local MCP tool names.

| Capability | MCP | CLI |
| --- | --- | --- |
| Load task context | `load_memory` | `aictx load` |
| Search memory | `search_memory` | `aictx search` |
| Inspect object | `inspect_memory` | `aictx inspect` |
| Remember durable context | `remember_memory` | `aictx remember` |
| Save structured patch | `save_memory_patch` | `aictx save` |
| Show memory diff | `diff_memory` | `aictx diff` |
| Initialize storage | none | `aictx init`, `aictx setup` |
| Review patch file | none | `aictx patch review` |
| Validate storage | none | `aictx check` |
| Rebuild generated index | none | `aictx rebuild` |
| Reset local storage | none | `aictx reset` |
| Upgrade storage schema | none | `aictx upgrade` |
| Show memory history | none | `aictx history` |
| Restore memory | none | `aictx restore` |
| Rewind memory | none | `aictx rewind` |
| List stale memory | none | `aictx stale` |
| Show graph neighborhood | none | `aictx graph`, `aictx view` graph screen |
| Show memory lens | none | `aictx lens` |
| Manage branch handoff | none | `aictx handoff` |
| Export Obsidian projection | none | `aictx export obsidian` |
| Manage project registry | none | `aictx projects` |
| View local memory | none | `aictx view` |
| Suggest memory decision packet | none | `aictx suggest` |
| Audit memory hygiene | none | `aictx audit` |
| Wiki source workflow | none | `aictx wiki` |
| Read public docs | none | `aictx docs` |

`aictx view [--port <number>] [--open] [--detach] [--json]` starts the local
memory viewer. `aictx view` is CLI-only in v1 and has no MCP equivalent.

## Documentation

The README is the fast activation path. Core docs:

- [Setup](https://docs.aictx.dev/getting-started/)
- [Agent recipes](https://docs.aictx.dev/agent-recipes/)
- [CLI reference](https://docs.aictx.dev/cli/)
- [MCP](https://docs.aictx.dev/mcp/)
- [Wiki workflow](https://docs.aictx.dev/wiki-workflow/)

## Contribute

Aictx is MIT-licensed and built in the open. Issues, docs fixes, examples,
agent recipes, and pull requests are welcome.

[Contribute on GitHub](https://github.com/aictx/memory/blob/main/CONTRIBUTING.md)
