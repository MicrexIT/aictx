---
title: "Talking to ChatGPT about a project without handing it the repo"
description: "A near-term Aictx workflow: discuss a project through memory-aware MCP tools instead of pasting code or broad context."
publishedAt: 2026-05-14
tags:
  - Use cases
  - MCP
  - ChatGPT
---

There are plenty of times when you want to talk about a project without giving
the assistant the whole codebase.

Maybe you want a second opinion on architecture. Maybe you want help planning a
feature before opening the repository to a coding agent. Maybe you want to ask
why a project is shaped the way it is, but you do not want to paste the README,
`AGENTS.md`, package manifests, docs, and a dozen previous decisions into a
chat.

This is one of the important directions for Aictx: let a ChatGPT-style
assistant talk to the project through durable memory instead of broad codebase
access.

The local Aictx model already has the useful pieces. Project memory is stored
as reviewable local files. `aictx load` compiles a task-focused context pack.
Local MCP exposes memory tools such as loading, searching, inspecting, saving,
and diffing memory when the client has launched and connected to `aictx-mcp`.

For ChatGPT specifically, the product direction is a memory-aware conversation
surface. The assistant should be able to ask for the relevant project context,
search durable decisions, inspect a source-backed synthesis, and talk about the
project without needing raw repository access by default.

The difference is subtle but important.

Without Aictx, a useful project conversation often starts with a context dump:

```text
Here is the product brief, the architecture summary, the agent instructions,
the latest decisions, the known gotchas, the setup commands, and the part of
the codebase I think matters.
```

That is expensive, noisy, and easy to get wrong. It also encourages the human
to hand over more source than the conversation actually needs.

With Aictx, the assistant can start from a smaller question:

```text
What durable project memory is relevant to "plan the billing integration"?
```

The answer should be a compact context pack: product intent, constraints,
workflow notes, source records, known traps, and open questions that matter for
that task. If the conversation needs more detail, the assistant can search or
inspect memory objects rather than asking for the whole repository.

That does not mean Aictx replaces code review or implementation access. Some
tasks still need source files. But many conversations do not. Product planning,
architecture discussion, onboarding, roadmap review, risk analysis, and
handoff cleanup often need project knowledge more than raw code.

This is also why Aictx keeps a clear boundary between current local MCP and
future hosted surfaces. Today, the CLI is the default routine path, and local
MCP is available when an MCP-capable client already exposes the Aictx tools.
Remote MCP endpoints, hosted sync, cloud auth, and ChatGPT App SDK UI are not
the v1 promise.

The useful promise is narrower and stronger: project memory should be portable,
local, inspectable, and shaped so different assistants can ask for the context
they need.

In that world, ChatGPT does not need to become the place where your entire repo
lives. It can become another client that talks to the project memory layer.
You get a conversation that understands the project, while keeping source
access explicit and proportional to the work.

That is the direction Aictx is built for: not bigger prompts, but better
project memory.

