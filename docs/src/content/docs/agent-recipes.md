---
title: Agent recipes
description: Copyable Aictx setup and routine-loop recipes for common coding agents.
---

Use these recipes when you want an AI coding agent to set up and use Aictx from
inside an existing repository.

Aictx is not an agent runtime. It is the local project-memory loop the agent
uses:

```text
load relevant memory -> do the work -> save what future agents should remember
```

The CLI is the default path. MCP is optional and should be used only when the
agent client has already launched and connected to `aictx-mcp`.

## Quick comparison

| Agent | Instruction file | Setup path | Routine path |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` | Paste the setup prompt into Codex from the repo root. | CLI by default; MCP only when configured. |
| Claude Code | `CLAUDE.md` | Paste the setup prompt into Claude Code from the repo root. | CLI by default; MCP only when configured. |
| Cursor | `.cursor/rules/aictx.mdc` | Add the generated rule, then paste the setup prompt. | CLI by default in agent commands. |
| Cline | `.clinerules/aictx.md` | Add the generated rule, then paste the setup prompt. | CLI by default in agent commands. |
| OpenCode | `AGENTS.md` | Use the root `AGENTS.md` created by `aictx init`. | CLI by default; MCP only when configured. |
| Generic MCP-capable agent | Agent-specific instructions plus MCP config | Paste the setup prompt; configure MCP later if needed. | CLI first, MCP for routine equivalents when already exposed. |

## Distribution artifacts

The files below package the same generated Aictx guidance for external
marketplace or catalog submission. They are not used by `aictx setup`, which
continues to write the marked sections in `AGENTS.md` and `CLAUDE.md`.

| Target | Path | Submission note |
| --- | --- | --- |
| Codex standalone skill | `integrations/codex/skills/aictx-memory/` | Copy into `openai/skills` when preparing a Codex skills catalog PR. |
| Codex plugin | `integrations/codex/plugins/aictx-memory/` | Follows the `.codex-plugin/plugin.json` format and points at `./skills/`. |
| Claude Code plugin | `integrations/claude/plugins/aictx-memory/` | Follows the `.claude-plugin/plugin.json` format; use Anthropic's plugin submission flow for official listing. |

These artifacts stay CLI-first. They do not bundle `.mcp.json`; use Aictx MCP
only when the current client has already launched and exposed `aictx-mcp`.

Marketplace commands target marketplace roots, not raw plugin directories. A
marketplace catalog should point at the generated Aictx plugin path, then users
add the marketplace and install from it. The Codex standalone skill is different:
copy `integrations/codex/skills/aictx-memory/` into the
[`openai/skills`](https://github.com/openai/skills) catalog when preparing that
PR.

Codex marketplace commands:

```bash
codex plugin marketplace add owner/repo
codex plugin marketplace add owner/repo --ref main
codex plugin marketplace add https://github.com/example/plugins.git --sparse .agents/plugins
codex plugin marketplace add ./local-marketplace-root

codex plugin marketplace upgrade
codex plugin marketplace upgrade marketplace-name
codex plugin marketplace remove marketplace-name
```

Claude Code interactive commands:

```text
/plugin marketplace add owner/repo
/plugin marketplace add ./local-marketplace-root
/plugin install aictx-memory@marketplace-name
/plugin marketplace list
/plugin marketplace update
/plugin marketplace remove marketplace-name
```

Claude Code CLI commands:

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

Reference formats: [Codex plugin manifests](https://developers.openai.com/codex/plugins/build#create-a-plugin-manually),
[Codex marketplace CLI](https://developers.openai.com/codex/cli/reference#codex-plugin-marketplace),
and [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).
For official Claude listing, use Anthropic's submission forms from
[Claude.ai](https://claude.ai/settings/plugins/submit) or
[Console](https://platform.claude.com/plugins/submit) rather than assuming a
direct pull request is enough.

## Common setup prompt

Paste this prompt into the agent from the project root:

```text
Set up fresh Aictx memory for this repository.

First install the current Aictx package globally:
npm install -g @aictx/memory

Run first-run onboarding, apply the conservative bootstrap memory patch, and
start the local viewer for inspection:
aictx setup

Validate memory:
aictx check

Load the first task-focused memory pack:
aictx load "onboard to this repository"

When this is done, report:
- whether setup applied memory
- whether check passed
- the viewer URL or the command `aictx view`
- the review command `aictx diff`
```

## Codex

Instruction file: `AGENTS.md`

Codex reads repository guidance from `AGENTS.md`. Run `aictx init` once so the
marked Aictx section is present, or paste the common setup prompt into Codex
from the repository root.

Normal loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

MCP note: keep using the CLI unless Codex already exposes Aictx MCP tools in
the current session. `aictx init` does not start MCP.

Distribution artifacts are available at `integrations/codex/skills/aictx-memory/`
for the standalone skill catalog and `integrations/codex/plugins/aictx-memory/`
for Codex plugin packaging. Codex plugin marketplace commands add a marketplace
catalog; after adding one, install the plugin from Codex's plugin directory.

## Claude Code

Instruction file: `CLAUDE.md`

Claude Code can use the `CLAUDE.md` guidance created by `aictx init`. Paste the
common setup prompt into Claude Code from the repository root for first-run
memory seeding.

Normal loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

Optional generated guidance is available at `integrations/claude/aictx.md` and
`integrations/claude/aictx/SKILL.md`.

The Claude Code plugin artifact is available at
`integrations/claude/plugins/aictx-memory/` for marketplace review or official
plugin submission. Add a Claude marketplace with `/plugin marketplace add` or
`claude plugin marketplace add`, then install the plugin as
`aictx-memory@marketplace-name`.

## Cursor

Instruction file: `.cursor/rules/aictx.mdc`

Copy `integrations/cursor/aictx.mdc` into `.cursor/rules/aictx.mdc`, then paste
the common setup prompt into Cursor from the repository root.

Normal loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

Keep Cursor rules short. The rule should tell the agent when to load memory,
when to save durable memory, and when saving nothing is correct; `.aictx/`
stores the project knowledge.

## Cline

Instruction file: `.clinerules/aictx.md`

Copy `integrations/cline/aictx.md` into `.clinerules/aictx.md`, then paste the
common setup prompt into Cline from the repository root.

Normal loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

Cline should use supported Aictx CLI or MCP entrypoints. It should not edit
`.aictx/` files directly when a supported command exists.

## OpenCode

Instruction file: `AGENTS.md`

OpenCode can use the root `AGENTS.md` guidance created by `aictx init`. No
separate OpenCode-specific generated file is needed in this release.

Setup prompt: paste the common setup prompt into OpenCode from the repository
root.

Normal loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

MCP note: use MCP equivalents only when OpenCode already exposes Aictx MCP
tools. Otherwise stay on the CLI path.

## Generic MCP-capable agents

Instruction file: whatever the agent client treats as persistent project
instructions.

Setup prompt: paste the common setup prompt from the repository root. Configure
MCP later only if the client supports launching `aictx-mcp`.

Routine CLI loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

Routine MCP equivalents when already configured:

```text
load_memory({ task: "<task summary>", mode: "coding" })
remember_memory({ task, memories, updates, stale, supersede, relations })
diff_memory({})
```

Setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs,
suggest, audit, wiki, and stale workflows remain CLI-only in v1. Graph inspection is
available in the CLI and local viewer, but remains outside MCP.

## CLI and MCP boundary

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory` when the client
already exposes Aictx MCP tools.

Setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs,
suggest, audit, wiki, and stale workflows are CLI-only in v1. Graph inspection is
available in the CLI and local viewer, but remains outside MCP. These non-MCP
surfaces are part of the v1 integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work.
