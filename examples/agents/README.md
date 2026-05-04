# Agent Examples

Use these snippets to connect Aictx to different coding-agent workflows.

The core loop is the same everywhere:

```bash
aictx load "<task>"
# agent works with repo-specific context in view
aictx save --stdin < memory-patch.json
aictx diff
```

## Codex

Add Aictx guidance to `AGENTS.md`:

```bash
aictx init
```

For a task:

```text
Before coding, run:
aictx load "<task>"

After meaningful work, decide whether durable project memory changed.
If yes, save it through `aictx save --stdin` and review with `aictx diff`.
Do not manually edit `.aictx/`.
```

## Claude Code

Add Aictx guidance to `CLAUDE.md`:

```bash
aictx init
```

Suggested task prompt:

```text
Use Aictx project memory for this repo.
Run `aictx load "<task>"` before changing files.
After meaningful work, save only durable project knowledge with `aictx save --stdin`.
Show me `aictx diff` before we commit memory changes.
```

## Cursor

Put this in repo rules or project instructions:

```text
This repo uses Aictx memory.
Before non-trivial changes, run `aictx load "<task>"` and use the output as project context.
After meaningful work, update memory only for durable facts, rules, workflows, decisions, or gotchas.
Review `.aictx/` changes with `aictx diff`.
```

If Cursor cannot run the command automatically, paste the output of:

```bash
aictx load "<task>"
```

into the chat.

## Gemini CLI

Use Aictx as a command-line preflight:

```bash
aictx load "<task>" > /tmp/aictx-context.md
gemini
```

Then paste `/tmp/aictx-context.md` into the session or reference it in your
prompt, depending on your Gemini CLI workflow.

After work:

```bash
aictx diff
```

If memory should change, ask Gemini to produce a structured patch and save it:

```bash
aictx save --stdin < memory-patch.json
```

## Generic MCP client

Expose the MCP server:

```bash
aictx-mcp
```

Routine tools:

* `load_memory`
* `search_memory`
* `save_memory_patch`
* `diff_memory`

Use CLI commands for setup, viewer, recovery, export, and audit workflows.
