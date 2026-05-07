---
title: Specializing Aictx
description: Tailor Aictx memory to a project, team, repo, and agent workflow.
---

Aictx works out of the box, but it becomes much more useful when memory matches
the shape of your project.

Specializing Aictx does not mean designing a big ontology. It means teaching
future agents the context a teammate would normally pick up over time: what the
product is for, which workflows matter, where traps live, what conventions are
current, and which facts are source-backed.

## Start with repo guidance

By default, `aictx init` updates marked Aictx sections in `AGENTS.md` and
`CLAUDE.md`. Keep those sections short and reviewable. They should tell agents
when to load memory, when to save durable memory, and when saving nothing is the
right answer.

If your agent client uses optional skills or instruction files, Aictx also ships
copyable generated guidance under `integrations/`. These files are setup aids,
not canonical memory.

Generated setup aids currently cover Codex, Claude Code, Cursor, Cline, and a
generic Markdown guidance file. OpenCode can use the root `AGENTS.md` that
`aictx init` creates. See [Agent recipes](/agent-recipes/) for copyable setup
prompts and exact target paths.

:::tip
Treat agent guidance as the operating manual, and `.aictx/` memory as the
project knowledge the agent can retrieve. Keep both small enough that a human
can audit them.
:::

## Seed the project shape

For a new project, run:

```bash
aictx setup
```

or apply the conservative bootstrap directly:

```bash
aictx setup --apply
```

For manual review:

```bash
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
```

Good bootstrap memory usually includes:

- `source` records for README files, package manifests, agent guidance, product
  docs, or stable external references recorded by an agent.
- `synthesis` records for product intent, feature map, roadmap, architecture,
  conventions, agent guidance, and repeated workflows or how-to collections.
- Atomic `decision`, `constraint`, `fact`, `gotcha`, `workflow`, `question`,
  `note`, or `concept` objects only when a precise durable claim is useful.

Do not invent product features from weak signals. Source-backed memory is much
easier to trust and repair later.

## Decide what belongs in memory

Save durable project knowledge, not task diaries.

Good candidates:

- product intent that explains why the app exists
- capabilities and feature boundaries
- architecture decisions and constraints
- setup, release, migration, debugging, recovery, verification, or maintenance
  workflows/how-tos
- gotchas and repeated failure modes
- current conventions that affect future edits
- open questions that block safe implementation
- source records for user-stated durable context

Bad candidates:

- "I edited three files and tests passed"
- guesses that are not supported by code, docs, or the user
- secrets, tokens, credentials, private keys, or sensitive raw logs
- temporary implementation notes with no future value
- generic tutorials that are not project-specific

:::tip
If a memory would be obsolete as soon as the current branch is merged, it is
probably task context, not durable project memory.
:::

## Maintain it after real work

At the end of meaningful work, ask for a read-only save/no-save packet when
useful:

```bash
aictx suggest --after-task "change auth routes" --json
```

Use the packet's `recommended_actions` as the primary advisory save/no-save
guide. Aictx can suggest the memory action and skeleton shape, but the agent
must still write the durable project meaning in the `title`, `body`, and
`reason` fields.

When current code changes are already present:

```bash
aictx suggest --from-diff --json
```

When memory feels noisy or contradictory:

```bash
aictx audit --json
aictx stale
aictx graph <id>
```

Failure and correction are useful signals. If loaded memory contradicted current
code, tests, docs, or the user request, repair the old memory. Update it, mark
it stale, supersede it, or delete it instead of piling on a duplicate.

## CLI and MCP

The CLI is the default interface for routine memory work. MCP is available when
the agent client has launched and connected to `aictx-mcp`.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows are CLI-only
in v1. These CLI-only commands are part of the v1 integration model rather than
MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI are future
work. Future ChatGPT-compatible `search`/`fetch` names are adapter aliases over
search and inspect behavior, not local MCP tool names.
