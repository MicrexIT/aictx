---
title: Wiki workflow
description: Source-backed wiki-style memory with ingest, file, lint, and log commands.
---

Aictx remains local-first project memory for coding agents. The wiki workflow is
a CLI-only wrapper for source-backed synthesis when a project, research thread,
or team knowledge base benefits from maintaining a persistent set of source
records and synthesized memory over time.

Aictx does not call an LLM, fetch URLs, read remote sources, or infer semantics.
The agent reads the source, discusses or synthesizes it with the human, and
supplies the resulting structured input through stdin.

MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, lenses,
branch handoff, maintenance, recovery, export, registry, viewer, docs, suggest,
audit, wiki, and stale workflows are CLI-only in v1. Graph inspection is
available in the CLI and local viewer, but remains outside local MCP.

## Layers

- Raw sources are the files, URLs, transcripts, articles, docs, or human notes
  the agent read. Aictx does not mutate them.
- Source records are Aictx `source` memories that summarize a raw source and
  carry an `origin` block such as a local file path, URL, capture timestamp,
  digest, and media type.
- Maintained syntheses are durable Aictx memories such as `synthesis`,
  `decision`, `constraint`, `fact`, `gotcha`, `workflow`, `question`,
  `concept`, or `note` records linked back to source records.

Use `origin` for raw-source identity. The existing object `source` field still
means who wrote the memory change.

## Ingest

```bash
aictx wiki ingest --stdin
aictx wiki ingest --stdin --dry-run --json
```

`wiki ingest` accepts one structured input with `task`, a required `source`
block, and the same semantic action arrays as `remember`: `memories`,
`updates`, `stale`, `supersede`, and `relations`.

The source block creates or updates a `source` memory with `origin`. New
semantic memories in the same input are automatically linked to that source by
`derived_from` unless the input already supplies a stronger source relation:
`derived_from`, `supports`, `summarizes`, or `documents`.

Example:

```json
{
  "task": "Ingest architecture note",
  "source": {
    "id": "source.architecture-note",
    "title": "Source: docs/architecture.md",
    "body": "# Source: docs/architecture.md\n\nSummarizes the current service boundaries.",
    "origin": {
      "kind": "file",
      "locator": "docs/architecture.md",
      "media_type": "text/markdown"
    },
    "evidence": [{ "kind": "file", "id": "docs/architecture.md" }]
  },
  "memories": [
    {
      "kind": "synthesis",
      "title": "Service boundary map",
      "body": "The API owns request validation while workers own async retries.",
      "category": "architecture",
      "applies_to": ["src/api/", "src/workers/"]
    }
  ]
}
```

## File

```bash
aictx wiki file --stdin
aictx wiki file --stdin --dry-run --json
```

`wiki file` files a useful query result, comparison, synthesis, or discovered
connection back into memory using the existing intent-first `remember` path. Use
it when a question produced reusable project knowledge that should not disappear
into chat history.

## Lint

```bash
aictx wiki lint
aictx wiki lint --json
```

`wiki lint` is a wiki-language alias over audit semantics. It reports stale or
superseded cleanup, weak provenance, missing source origin, excessive
`related_to`, active `challenges`/`conflicts_with` maintenance signals, role
coverage gaps, and other deterministic memory hygiene findings. It does not
mutate canonical files.

## Log

```bash
aictx wiki log
aictx wiki log --limit 50 --json
```

`wiki log` renders a chronological log from `.aictx/events.jsonl`. It is
generated from canonical events and does not write `log.md` or any other
canonical memory file.

## Uses beyond coding projects

The primary workflow is still coding-project memory: product intent, feature
maps, architecture, conventions, workflows, verification, gotchas, questions,
and source-backed syntheses.

The same mechanics also work for secondary wiki-style use cases such as
research notebooks, personal knowledge bases, competitive analysis, course
notes, and team knowledge bases. In those cases, keep source records explicit,
link syntheses back to sources, and use `wiki lint` periodically to find stale
claims, contradiction signals, missing origins, and unlinked concepts.
