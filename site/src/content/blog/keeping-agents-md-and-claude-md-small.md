---
title: "Keeping AGENTS.md and CLAUDE.md small"
description: "Use agent instruction files as operating manuals, and let Aictx carry the project knowledge that changes over time."
publishedAt: 2026-05-14
tags:
  - Use cases
  - Agent guidance
  - Context
---

`AGENTS.md` and `CLAUDE.md` are useful. They are just easy to overload.

At first they hold a few simple rules: how to run tests, what style to follow,
which commands are safe, and when to ask for help. Then they grow. Product
intent goes in. Architecture decisions go in. Known traps go in. Setup notes,
release workflows, debugging stories, and old migration details go in.

Eventually the file that was supposed to help the agent becomes another broad
document every agent has to reread on every task.

Aictx draws a cleaner line.

Use `AGENTS.md` and `CLAUDE.md` as operating manuals. They should tell the
agent how to behave in the repository: load memory before non-trivial work,
save durable knowledge after meaningful work, avoid editing `.aictx/` directly
when a supported command exists, and report whether memory changed.

Put the project knowledge in Aictx memory.

That means product intent, architecture summaries, conventions, workflows,
known traps, source records, and open questions live under `.aictx/` as local,
reviewable memory. The agent instruction file stays short because it does not
need to carry every fact the agent might someday need. It only needs to teach
the agent how to retrieve the right facts.

The daily loop becomes:

```bash
aictx load "<task summary>"
# do the work
aictx remember --stdin
aictx diff
```

This is especially useful when you switch between Claude Code and Codex.

Without a memory layer, teams often try to keep `CLAUDE.md`, `AGENTS.md`, and
other agent-specific files linked by hand. One file gets updated. Another
drifts. A third has the same rule phrased differently. Agents start from
slightly different context, and humans spend time maintaining duplicated
instructions instead of improving the project.

With Aictx, the durable project context has one normal home. `aictx setup` can
initialize storage, create or update marked Aictx sections in the instruction
files, and apply a conservative bootstrap memory patch, while `.aictx/` stores
the evolving knowledge. Claude Code and Codex can both follow their native
instruction file, but the project memory they load is the same.

That gives you two practical benefits.

First, each agent loads less noise. A task about viewer filters does not need
to read every release note, every product decision, and every setup gotcha. It
needs the relevant memory pack for viewer work.

Second, the memory can stay current after real work. If an agent discovers that
an old setup command is wrong, the fix should not be a one-off chat correction.
It should become durable memory: update the workflow, mark the stale fact, or
save the new gotcha with evidence. The next Claude Code or Codex session should
not rediscover the same failure.

The instruction file still matters. It is where you teach the agent the memory
discipline. But it should stay small enough that a human can audit it quickly.

The project itself deserves a richer memory than that. Aictx keeps that richer
context local, typed, searchable, and reviewable, so agent-specific files can
stay focused on behavior instead of becoming stale project encyclopedias.
