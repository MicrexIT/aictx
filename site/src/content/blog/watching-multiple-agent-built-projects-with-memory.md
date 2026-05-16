---
title: "Watching multiple agent-built projects with Memory"
description: "How I use the Memory viewer to keep track of several agent-built projects without reading every chat transcript."
publishedAt: 2026-05-14
tags:
  - Use cases
  - Viewer
  - Agent workflows
---

When I have a few agents building a few projects, the problem is not only
"did the agent finish?" The harder question is "what is this project becoming?"

A chat log can answer what happened minute by minute. It is much worse at
answering what should survive the session. If I have one agent shaping a CLI
tool, another turning a product sketch into a web app, and another testing a
data model, I do not want to read every transcript just to understand which
project has a clear product thesis.

This is where I use Memory as a local project-state viewer.

Each project gets its own `.memory/` memory. The useful facts stay isolated:
product intent, architecture, known traps, conventions, source records, open
questions, and decisions that should carry into the next session. There is no
shared global memory where one experiment leaks into another.

Then I open the viewer:

```bash
memory view
```

![Memory local viewer showing several projects and their durable memory](/assets/use-case-viewer-dashboard.png)

The viewer gives me a dashboard over the local project registry. I can move
between projects and inspect what the agents actually made durable: which
sources were captured, which decisions were saved, which questions are still
open, and which syntheses describe the current product and architecture.

That is the useful layer for me. It is not metrics-and-traces observability. It
is project-state observability.

I can see whether a project has a coherent product intent, whether the
architecture summary matches the repository, whether the setup workflow is
usable, and whether the memory is evidence-backed or just a pile of vague notes.

For concurrent project generation, that distinction matters. A transcript
answers "what did the agent say?" Memory answers "what should the next
agent or human safely assume about this project?"

The viewer also makes comparison easier. If I have five candidate projects in
flight, I can inspect them at the level that matters:

- What is the product intent?
- What stack and tooling did the agent settle on?
- What decisions are source-backed?
- What workflows are ready for another agent to run?
- What open questions would block implementation or review?

That gives me a better control surface. I can decide which project is ready for
deeper work, which one needs correction, and which one should be abandoned
before more agent time is spent on it.

The important boundary is that Memory stays local-first. The viewer launches
from my machine, binds to localhost, and reads project memory from the local
registry and each project's `.memory/` directory. I do not have to send every
generated repository into a hosted dashboard just to see what happened.

For parallel agent work, the loop I want is simple:

```bash
memory setup
memory load "continue this project"
memory remember --stdin
memory view
```

The agent keeps its working context focused. I inspect the durable state
afterward. The next agent starts from what should last, not from whatever
happened to be said in the previous chat.
