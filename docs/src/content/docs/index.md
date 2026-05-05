---
title: Aictx documentation
description: Public documentation for local-first project memory for AI coding agents.
---

# Aictx documentation

Aictx is local-first project memory for AI coding agents.

It gives agents a durable place to store project facts, decisions, constraints,
gotchas, workflows, and source-backed syntheses that should survive beyond one
chat. Memory is stored under `.aictx/` as reviewable local files and indexed
locally for fast retrieval.

The normal loop is:

```text
load relevant memory -> do work -> save durable memory -> review .aictx changes
```

Core memory commands do not require a cloud account, embeddings, hosted sync, an
external model API, or network access.

## Start here

- [Getting started](/getting-started/) installs Aictx and walks through the first memory loop.
- [Mental model](/mental-model/) explains canonical memory, generated state, and storage layers.
- [Agent integration](/agent-integration/) gives coding agents the safe operating rules.
- [Reference](/reference/) lists commands and the structured patch shape.

## For agents

This site is also published with agent-readable documentation files:

- `/llms.txt`
- `/llms-full.txt`
- `/llms-small.txt`

Use the agent files when a coding agent needs compact public documentation
without crawling the full website navigation.
