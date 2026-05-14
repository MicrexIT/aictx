# Current Architecture

- Aictx stores local-first project memory in `.aictx/` as Markdown bodies plus JSON sidecars, relations, events, bundled schemas, and a generated SQLite index.
- Storage v4 is canonical: config version is `4`, bundled schema IDs use `https://aictx.dev/schemas/v4/...`, and source memories can carry raw-source `origin` metadata.
- The generated SQLite index is schema v5 and indexes source-origin data for search and file-origin links.
- The CLI remains the primary project-memory interface. MCP exposes only the normalized local-agent tools: load, search, inspect, remember, save patch, and diff.
- Wiki-style source workflows are CLI-only through `aictx wiki ingest`, `aictx wiki file`, `aictx wiki lint`, and `aictx wiki log`; Aictx validates and writes agent-supplied synthesis but does not call an LLM or fetch remote sources.
- Relations use controlled predicates. `supports` is source/provenance evidence alongside `derived_from`, `summarizes`, and `documents`; `challenges` is a contradiction/maintenance signal alongside `conflicts_with`.
- The viewer and Obsidian export are generated inspection surfaces over canonical memory, including source origin and relation context.
