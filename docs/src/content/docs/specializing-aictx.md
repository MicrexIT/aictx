---
title: Specializing Aictx
description: Tailor Aictx memory to a project, team, repo, and agent workflow.
---

Aictx works out of the box, but it becomes more useful when memory matches the
shape of your project.

Specializing Aictx does not mean designing a large ontology. It means teaching
future agents the context a teammate would normally pick up over time: what the
product is for, which workflows matter, where traps live, what conventions are
current, and which facts are source-backed.

## Start with repo guidance

By default, `aictx setup` updates marked Aictx sections in `AGENTS.md` and
`CLAUDE.md`. Keep those sections short and reviewable. They should tell agents
when to load memory, when to save durable memory, and when saving nothing is the
right answer.

If your agent client uses optional skills or instruction files, Aictx also ships
copyable generated guidance under `integrations/`. These files are setup aids,
not canonical memory.

Generated setup aids currently cover Codex, Claude Code, Cursor, Cline, and a
generic Markdown guidance file. OpenCode can use the root `AGENTS.md` that
setup creates. See [Agent recipes](/agent-recipes/) for copyable prompts and
target paths.

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

or preview the conservative bootstrap:

```bash
aictx setup --dry-run
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
  conventions, agent guidance, and repeated workflows.
- Atomic `decision`, `constraint`, `fact`, `gotcha`, `workflow`, `question`,
  `note`, or `concept` objects when a precise durable claim is useful.

Do not invent product features from weak signals. Source-backed memory is much
easier to trust and repair later.

## Decide what belongs in memory

Save durable project knowledge, not task diaries.

Good candidates:

- product intent that explains why the app exists
- capabilities and feature boundaries
- architecture decisions and constraints
- setup, release, migration, debugging, recovery, verification, or maintenance
  workflows
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

Use the packet's `recommended_actions` as advisory. Aictx can suggest the memory
action and skeleton shape, but the agent still writes the durable project
meaning in the `title`, `body`, and `reason` fields.

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

Use the CLI by default. Add MCP only after your agent client is configured to
launch `aictx-mcp`. See the [MCP guide](/mcp/) for exact tool boundaries.
