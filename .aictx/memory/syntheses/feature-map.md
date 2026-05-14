# Feature map

Current product capabilities inferred from durable repository evidence:
- CLI binary `aictx` provides local project-memory commands.
- CLI binary `aictx-mcp` exposes the normalized local MCP tool set.
- Routine memory commands include `load`, `search`, `inspect`, `remember`, `save`, and `diff`.
- Maintenance and inspection commands include `check`, `rebuild`, `audit`, `suggest`, `stale`, `graph`, `lens`, `handoff`, `history`, `restore`, `rewind`, `export obsidian`, `view`, and `docs`.
- `aictx setup` and `suggest --bootstrap --patch` create deterministic source records for repository files with v4 `origin` identity: `kind`, `locator`, media type when known, and a SHA-256 digest when the local file is readable.
- Wiki source workflow commands include `aictx wiki ingest`, `aictx wiki file`, `aictx wiki lint`, and `aictx wiki log`; these are CLI-only in v1 and operate on agent-supplied source summaries and syntheses.
- Storage v4 source records support raw-source `origin` identity, and relation predicates include `supports` and `challenges`.
- The local viewer supports searchable object summaries, provenance/origin display, relation neighborhoods, graph inspection, Obsidian export, and demo seed data that exercises v4 source origins plus `supports`/`challenges` relations.
- Context retrieval indexes and ranks source-origin locator and file-reference material so source records can be loaded by origin identity even when the body omits the locator.

Update this synthesis when product capabilities are added, removed, renamed, or moved across CLI/MCP/viewer boundaries.