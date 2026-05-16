---
title: "Keeping AGENTS.md and CLAUDE.md small"
description: "How I keep agent instruction files short, readable, and focused by moving changing project knowledge into Memory."
publishedAt: 2026-05-14
tags:
  - Use cases
  - Agent guidance
  - Context
---

I still want `AGENTS.md` and `CLAUDE.md`. I just do not want them to become the
place where every project fact goes to get stale.

That was the problem I kept running into. The file would start clean: how to run
tests, which package manager to use, what style to follow, when to load memory,
and what to report at the end. Then I would add a product decision because it
felt important. Then a setup note. Then a debugging trap. Then a migration
detail that only mattered for one feature area.

After a while, the instruction file was no longer an operating manual. It was a
project encyclopedia that every agent had to skim before doing even a small
task.

The way I use Memory is to draw a hard line between behavior and knowledge.

![Short AGENTS.md file beside reviewable Memory objects](/assets/use-case-agent-files.png)

`AGENTS.md` and `CLAUDE.md` tell the agent how to work in the repo. They say to
load memory before non-trivial work, save durable knowledge after meaningful
work, avoid editing `.memory/` directly when a supported command exists, and tell
me whether memory changed.

The changing project knowledge lives in Memory.

That means product intent, architecture summaries, conventions, workflows,
known traps, source records, and open questions can live under `.memory/` as
local, reviewable memory. The instruction file stays short because it only has
to teach the agent how to retrieve the right facts.

The daily loop I want the agent to follow is:

```bash
memory load "the task I am about to do"
# work with the loaded project memory
memory remember --stdin
memory diff
```

This became especially useful once I started switching between Claude Code and
Codex. I do not want to maintain one set of project facts in `CLAUDE.md`,
another in `AGENTS.md`, and a third version in some copied prompt. One file
drifts, another says the same thing differently, and then different agents start
from subtly different assumptions.

With Memory, the durable project context has one normal home. `memory setup` can
initialize storage, create or update the marked Memory sections in instruction
files, and apply a conservative bootstrap memory patch. After that, `.memory/`
stores the knowledge that keeps evolving.

That gives me two practical benefits.

First, agents load less noise. A task about viewer filters does not need every
release note, every product decision, and every setup gotcha. It needs the
memory pack relevant to viewer work.

Second, discoveries from real work can survive the chat. If an agent finds that
an old setup command is wrong, I do not want that fix buried in a transcript. I
want it saved as durable memory: update the workflow, mark the stale fact, or
record the gotcha with evidence.

The instruction file still matters. It is where I teach the agent the memory
discipline. But I want it short enough that I can audit it quickly.

The project deserves richer memory than an instruction file should carry.
Memory keeps that richer context local, typed, searchable, and reviewable, so
agent-specific files can stay focused on behavior instead of becoming stale
project encyclopedias.
