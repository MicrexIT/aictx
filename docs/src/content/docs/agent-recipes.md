---
title: Agent recipes
description: Copyable Aictx setup and routine-loop recipes for common coding agents.
---

Use these recipes when you want an AI coding agent to set up and use Aictx from
inside an existing repository.

The working loop is:

```text
load relevant memory -> do the work -> save what future agents should remember
```

The CLI is the default path. MCP is optional and only helps after the agent
client has launched with `aictx-mcp` configured.

## Quick comparison

| Agent | Instruction file | Setup path | Routine path |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` | Paste the setup prompt into Codex from the repo root. | CLI by default; MCP only when configured. |
| Claude Code | `CLAUDE.md` | Paste the setup prompt into Claude Code from the repo root. | CLI by default; MCP only when configured. |
| Cursor | `.cursor/rules/aictx.mdc` | Add the generated rule, then paste the setup prompt. | CLI by default in agent commands. |
| Cline | `.clinerules/aictx.md` | Add the generated rule, then paste the setup prompt. | CLI by default in agent commands. |
| OpenCode | `AGENTS.md` | Use the root `AGENTS.md` created by setup. | CLI by default; MCP only when configured. |
| Generic MCP-capable agent | Agent-specific instructions plus MCP config | Paste the setup prompt; configure MCP later if needed. | CLI first, MCP for routine equivalents when already exposed. |

## Distribution artifacts

The files below package the same generated Aictx guidance for external
marketplace or catalog submission. They are not used by `aictx setup`, which
writes the marked sections in `AGENTS.md` and `CLAUDE.md`.

| Target | Path | Submission note |
| --- | --- | --- |
| Codex standalone skill | `integrations/codex/skills/aictx-memory/` | Copy into `openai/skills` when preparing a Codex skills catalog PR. |
| Codex plugin | `integrations/codex/plugins/aictx-memory/` | Follows the `.codex-plugin/plugin.json` format and points at `./skills/`. |
| Claude Code plugin | `integrations/claude/plugins/aictx-memory/` | Follows the `.claude-plugin/plugin.json` format; use Anthropic's plugin submission flow for official listing. |

These artifacts stay CLI-first. They do not bundle `.mcp.json`; configure MCP
in the client when you want it.

For the self-hosted marketplace in this repo, Codex users add the marketplace,
then install **Aictx Memory** from Codex Plugins:

```bash
codex plugin marketplace add aictx/memory
```

Claude Code users can add the marketplace and install the plugin directly:

```text
/plugin marketplace add aictx/memory
/plugin install aictx-memory@aictx
```

See [Publishing plugins](/plugin-publishing/) for marketplace and official
submission details.

## Common setup prompt

Paste this prompt into the agent from the project root:

```text
Set up fresh Aictx memory for this repository.

Run:
npm install -g @aictx/memory
aictx setup
aictx check
aictx load "onboard to this repository"

When this is done, report:
- whether setup applied memory
- whether check passed
- the viewer URL or the command `aictx view`
- the review command `aictx diff`
```

## Codex

Instruction file: `AGENTS.md`

Codex reads repository guidance from `AGENTS.md`. Run `aictx setup` once so the
marked Aictx section is present and first-run memory is seeded, or paste the
common setup prompt into Codex from the repository root.

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
for Codex plugin packaging.

## Claude Code

Instruction file: `CLAUDE.md`

Claude Code can use the `CLAUDE.md` guidance created by `aictx setup`. Paste
the common setup prompt into Claude Code from the repository root for first-run
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
plugin submission.

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

OpenCode can use the root `AGENTS.md` guidance created by setup. No separate
OpenCode-specific generated file is needed in this release.

Normal loop:

```bash
aictx load "<task summary>"
aictx remember --stdin
aictx diff
```

## Generic MCP-capable agents

Instruction file: whatever the agent client treats as persistent project
instructions.

Paste the common setup prompt from the repository root. Configure MCP later only
if the client supports launching `aictx-mcp`.

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

For the exact MCP tool list and CLI-only boundaries, see the [MCP guide](/mcp/).
