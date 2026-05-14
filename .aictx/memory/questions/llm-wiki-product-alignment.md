# Should Aictx make wiki-style source ingest and synthesis maintenance first-class before users?

Resolved: Aictx implemented the Karpathy-style wiki pattern as a first-class CLI workflow while keeping coding-project memory primary. Storage v4 adds source `origin`, `supports`, and `challenges`; `aictx wiki ingest`, `aictx wiki file`, `aictx wiki lint`, and `aictx wiki log` provide source-backed ingest, query-result filing, maintenance linting, and generated chronological logs without adding new MCP tools.

The product stance is explicit: Aictx does not call an LLM, fetch remote URLs, or infer semantics. The agent supplies source summaries and durable syntheses, and Aictx validates and writes them deterministically.
