# Source: Karpathy LLM Wiki pattern

User supplied Andrej Karpathy's LLM Wiki gist during product architecture discussion on 2026-05-14. URL: https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md

Key reusable thesis: instead of relying only on RAG over raw documents, an LLM can incrementally maintain a persistent wiki layer over immutable raw sources. The wiki accumulates source summaries, entity and concept pages, cross-references, contradictions, syntheses, index/log files, and periodic lint results so future questions reuse maintained knowledge instead of re-deriving it from scratch.