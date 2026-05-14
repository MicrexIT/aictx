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
suggest, audit, and stale workflows remain CLI-only in v1. Graph inspection is
available in the CLI and local viewer, but remains outside MCP.

## CLI and MCP boundary

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory` when the client
already exposes Aictx MCP tools.

Setup, lenses, handoff, maintenance, recovery, export, registry, viewer, docs,
suggest, audit, and stale workflows are CLI-only in v1. Graph inspection is
available in the CLI and local viewer, but remains outside MCP. These non-MCP
surfaces are part of the v1 integration model rather than MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work.
