---
title: "Watching multiple agent-built projects with Aictx"
description: "Use Aictx as a local observability layer when several coding agents are creating projects at the same time."
publishedAt: 2026-05-14
tags:
  - Use cases
  - Viewer
  - Agent workflows
---

When coding agents are working across several projects, the hard part is not
only whether each agent can finish a task. The hard part is knowing what each
project is becoming.

Imagine running OpenClaw and Paperclip agents against a set of new project
ideas. One agent is shaping a CLI tool. Another is turning a rough product
sketch into a web app. A third is exploring a data model. Their chat logs can
tell you what happened moment by moment, but they are a poor surface for
understanding durable project state.

Aictx gives each project its own local memory under `.aictx/`. That memory can
capture product intent, architecture, known traps, conventions, source records,
open questions, and decisions that should survive the current agent session.
Each project stays isolated. There is no shared global brain where one
experiment leaks into another. But the human running the work still gets a way
to inspect the shape of all those projects without tailing every chat.

That is where the viewer matters.

Run `aictx view`, and Aictx opens a local browser viewer over the project
registry. The registry records local project roots and metadata, while each
project keeps its own canonical memory files. From that dashboard you can move
between projects and inspect what their agents have actually made durable:
which sources were captured, which decisions were saved, which questions are
still open, and which syntheses describe the current product and architecture.

This turns Aictx into a lightweight observability layer for agent-created
projects.

It is not observability in the metrics-and-traces sense. It is project-state
observability. You can see whether an agent has established a product thesis,
whether the architecture summary matches the repository, whether the setup
workflow is usable, and whether the memory is evidence-backed or just a pile of
session notes.

For concurrent project generation, that distinction matters. A chat transcript
answers "what did the agent say?" Aictx memory answers "what should the next
agent or human safely assume about this project?"

The viewer also makes comparison easier. If OpenClaw has created three
candidate apps and Paperclip has created two more, you can inspect their memory
side by side at the level that matters:

- What is the product intent?
- What stack and tooling did the agent settle on?
- What decisions are source-backed?
- What workflows are ready for another agent to run?
- What open questions would block implementation or review?

This gives humans a better control surface. You can decide which project is
ready for deeper work, which one needs correction, and which one should be
discarded before more agent time is spent on it.

The important boundary is that Aictx stays local-first. The viewer is launched
from your machine, binds to localhost, and reads project memory from the local
registry and each project's `.aictx/` directory. Aictx is not asking you to
send every generated repository into a hosted dashboard just so you can see
what happened.

For teams experimenting with parallel agent workflows, that makes the loop
simple:

```bash
aictx setup
aictx load "continue building this project"
aictx remember --stdin
aictx view
```

Agents keep their working context focused. Humans inspect the durable state
afterward. The next agent starts from what should last, not from whatever
happened to be said in the previous chat.

