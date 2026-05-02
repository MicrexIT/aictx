# Aictx Indexing and Context Compiler Spec

## 1. Purpose

This document defines the v2 generated index and context compiler behavior for Aictx.

This spec owns:

* SQLite index location and schema
* Full-text search indexing
* Rebuild behavior
* Incremental update behavior
* Search result shape
* Retrieval and ranking rules
* Token-budget handling
* Context pack format

This spec depends on:

* `storage-format-spec.md` for canonical files, IDs, object types, statuses, relations, events, scopes, and hashes.
* `mcp-and-cli-api-spec.md` for CLI/MCP request and response shapes.

This spec does not define:

* Canonical storage files
* Patch write format
* CLI syntax
* MCP tool names

## 2. Index Principles

Indexing must follow these rules:

* The SQLite index is generated data.
* The index is never canonical.
* The index must be rebuildable from `.aictx/config.json`, `.aictx/memory/`, `.aictx/relations/`, and `.aictx/events.jsonl`.
* Deleting `.aictx/index/` must not lose memory.
* Indexing must not require network access.
* Embeddings are not part of v1.
* SQLite FTS is the only v1 search backend.
* Rebuild must not mutate canonical files.

## 3. Index Location

SQLite database path:

```text
.aictx/index/aictx.sqlite
```

Rules:

* `.aictx/index/` must be gitignored when Git is available.
* If the index is missing, read commands may rebuild it when `config.memory.autoIndex` is `true`.
* If the index is missing and auto-indexing is disabled, `load_memory` and `search_memory` should return `AICtxIndexUnavailable`.
* If the index is corrupt, Aictx should attempt one rebuild when auto-indexing is enabled.
* If rebuild fails, Aictx should return `AICtxIndexUnavailable` with validation details.

## 4. SQLite Schema

V2 schema:

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE objects (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  body_path TEXT NOT NULL,
  json_path TEXT NOT NULL,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_project TEXT NOT NULL,
  scope_branch TEXT,
  scope_task TEXT,
  tags_json TEXT NOT NULL,
  facets_json TEXT,
  facet_category TEXT,
  applies_to_json TEXT,
  evidence_json TEXT,
  source_json TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence TEXT,
  evidence_json TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE events (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  line_number INTEGER NOT NULL,
  event TEXT NOT NULL,
  memory_id TEXT,
  relation_id TEXT,
  actor TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT,
  payload_json TEXT
);

CREATE VIRTUAL TABLE objects_fts USING fts5(
  object_id UNINDEXED,
  title,
  body,
  tags,
  facets,
  evidence
);
```

Required indexes:

```sql
CREATE INDEX objects_type_idx ON objects(type);
CREATE INDEX objects_status_idx ON objects(status);
CREATE INDEX objects_updated_at_idx ON objects(updated_at);
CREATE INDEX objects_scope_project_idx ON objects(scope_project);
CREATE INDEX objects_scope_kind_idx ON objects(scope_kind);
CREATE INDEX objects_scope_branch_idx ON objects(scope_branch);
CREATE INDEX objects_scope_task_idx ON objects(scope_task);
CREATE INDEX objects_facet_category_idx ON objects(facet_category);
CREATE INDEX relations_from_idx ON relations(from_id);
CREATE INDEX relations_to_idx ON relations(to_id);
CREATE INDEX relations_predicate_idx ON relations(predicate);
CREATE INDEX events_memory_id_idx ON events(memory_id);
CREATE INDEX events_relation_id_idx ON events(relation_id);
CREATE INDEX events_line_number_idx ON events(line_number);
```

Meta keys:

```text
schema_version
built_at
source_git_commit
git_available
storage_version
object_count
relation_count
event_count
```

Rules:

* `schema_version` is the generated index schema version, not the storage format version.
* V2 `schema_version` is `2`.
* `git_available` records whether the project root was inside a Git worktree at rebuild time.
* `source_git_commit` records the Git `HEAD` used at rebuild time when Git is available, otherwise it is empty or omitted.
* When Git is available, the index may be stale when `.aictx/` has uncommitted canonical changes.
* `objects_fts.object_id` stores `objects.id`.
* `facets.category`, `facets.applies_to`, and object-level evidence are stored in dedicated JSON/search columns so retrieval can prefer memories tied to relevant paths, tests, configs, or prior memory.
* FTS rows must be maintained by rebuild or incremental update code; v2 does not require SQLite triggers.
* `events.line_number` is the 1-based line number from `events.jsonl` at rebuild time.

## 5. Rebuild Behavior

`aictx rebuild` recreates generated index data from canonical files.

Behavior:

* Validate canonical files enough to safely parse them.
* Read all memory object sidecars and Markdown bodies.
* Read all relation files.
* Read all `events.jsonl` records.
* Replace `.aictx/index/aictx.sqlite` atomically where possible.
* Populate `objects`, `relations`, `events`, and `objects_fts`.
* Write `meta` rows.
* Do not mutate canonical files.
* Do not append `index.rebuilt` to `events.jsonl` in v1.

Failure behavior:

* If canonical validation fails, do not replace a previously valid index.
* If no previous valid index exists, return `AICtxIndexUnavailable`.
* If rebuild succeeds, return counts for indexed objects, relations, and events.

## 6. Incremental Update Behavior

Incremental updates are allowed after `save_memory_patch`.

Triggers:

* Successful `save_memory_patch`
* Successful `aictx save --stdin`
* Successful `aictx save --file`

Behavior:

* Update only touched objects, relations, and events when possible.
* Use `content_hash` to skip unchanged objects.
* If an incremental update fails, run a full rebuild when `config.memory.autoIndex` is `true`.
* If full rebuild fails, return the write result with an index warning when canonical files were already written successfully.

Manual file changes:

* `load_memory` and `search_memory` should detect stale hashes or missing indexed objects when practical.
* If auto-indexing is enabled, they may rebuild before serving results.
* If auto-indexing is disabled and stale index state is detected, return `AICtxIndexUnavailable`.

## 7. Search Behavior

`search_memory` and optional `aictx search` use the local SQLite index.

Input:

```json
{
  "query": "Stripe webhook idempotency",
  "limit": 10
}
```

Rules:

* `query` is required and must be non-empty after trimming.
* `limit` defaults to `10`.
* `limit` must be between `1` and `50`.
* Search must not include `rejected` memory by default.
* Search may include `stale` and `superseded` memory, but results must expose status clearly.
* Search must not require embeddings.

Search process:

1. Normalize query text by trimming whitespace.
2. Search exact IDs and body paths.
3. Search `objects_fts`.
4. Merge and de-duplicate by object ID.
5. Rank results with the v1 scoring rules.
6. Return at most `limit` matches.

Search result item:

```json
{
  "id": "constraint.webhook-idempotency",
  "type": "constraint",
  "status": "active",
  "title": "Webhook processing must be idempotent",
  "snippet": "Stripe may deliver duplicate events...",
  "body_path": ".aictx/memory/constraints/webhook-idempotency.md",
  "score": 12.4
}
```

## 8. Context Compiler Input

`load_memory` and `aictx load` compile a context pack for a task.

Input fields:

* `task` is required.
* `token_budget` is optional.
* `mode` is optional and defaults to `coding`.

Defaults:

* If `token_budget` is omitted, do not apply a token target.
* `config.memory.defaultTokenBudget` is retained for compatibility and future user preference work, but v1 must not silently use it as a truncation target.
* Allowed modes are `coding`, `debugging`, `review`, `architecture`, and `onboarding`.

Validation:

* `task` must be non-empty after trimming.
* `token_budget` must be greater than `500`.
* `token_budget` values above `50000` must be treated as `50000`.
* `mode` must be one of the allowed modes.

Mode profiles:

* `coding`: balanced default; prefer constraints, decisions, architecture, gotchas, workflows, facts, and open questions.
* `debugging`: boost gotchas, constraints, facts, stale/superseded warnings, and related decisions.
* `review`: boost constraints, decisions, gotchas, stale/superseded warnings, and changed-file-related memory.
* `architecture`: boost architecture, decisions, constraints, concepts, and open questions.
* `onboarding`: boost project, architecture, concepts, workflows, constraints, and a small number of gotchas.

Modes must tune deterministic ranking and rendering only. They must not broaden project scope, call a model, use embeddings, or load the whole project.

## 9. Retrieval Pipeline

The context compiler uses a deterministic hybrid retrieval pipeline.

Pipeline:

1. Extract task terms from the task string.
2. Match exact memory IDs, relation IDs, file paths, and tags mentioned in the task.
3. Run FTS search over titles, bodies, tags, facets, and object evidence.
4. Add directly related objects using graph traversal.
5. Add recent high-priority memory.
6. Filter by status and scope.
7. Score and rank candidates.
8. Apply precision-first packaging; use an explicit token budget as an advisory target only when provided.
9. Render the context pack.

Graph traversal:

* Include one-hop relations from high-scoring candidates.
* Include both outgoing and incoming relations.
* Prefer `requires`, `depends_on`, `supersedes`, and `conflicts_with` over `related_to`.
* Do not traverse more than one hop.

Scope filtering:

* Include `kind: "project"` memory for the current project by default.
* Include `kind: "branch"` memory only when Git is available, the current branch is non-null, and the current branch matches `scope.branch`.
* Include `kind: "task"` memory only when it matches the current task terms.
* Use the denormalized `scope_kind`, `scope_project`, `scope_branch`, and `scope_task` columns for filtering; `scope_json` remains the canonical indexed copy for diagnostics and rebuild checks.
* Prefer project-scoped memory over branch/task-scoped memory unless the branch/task match is strong.
* Global, workspace, and cross-project scopes are not supported.

Facet and evidence matching:

* `facets.category` terms should boost memories whose durable category fits the task.
* `facets.applies_to` should boost memories tied to paths, tests, configs, or subsystem names mentioned in the task.
* `facets.load_modes` should boost memories when the requested load mode matches.
* File, memory, relation, commit, and task evidence should participate in direct matching and FTS material.
* Facets and evidence are ranking hints, not proof that a memory is correct.

Status filtering:

* `active`, `open`, and `draft` may be included in primary sections.
* `stale` and `superseded` must not be included in `Must know`.
* `rejected` must be excluded by default.
* `stale` and `superseded` may appear in `Stale or superseded memory to avoid`.

## 10. V2 Scoring Rules

Scoring should be simple, explainable, and deterministic.

Base score sources:

```text
exact ID match:                 +100
exact body_path match:           +80
tag match:                       +40
title FTS match:                 +30
body FTS match:                  +15
facet category match:            +18
facet applies_to match:          +18
object evidence match:           +10
one-hop relation from match:     +12
recent memory boost:              +5
load-mode facet boost:            +6
```

Recent memory boost:

* Apply the boost to the five newest candidate objects by `updated_at`.
* Do not apply the boost to `stale`, `superseded`, or `rejected` objects.

Type modifiers:

```text
constraint:      +20
decision:        +18
architecture:    +12
question:        +10
fact:             +8
gotcha:          +14
workflow:        +10
concept:          +6
project:          +8
note:             +0
```

Status modifiers:

```text
active:          +20
open:            +12
draft:            -5
stale:           -30
superseded:      -35
rejected:       exclude by default
```

Relation predicate modifiers:

```text
requires:        +12
depends_on:      +10
conflicts_with:  +10
supersedes:       +8
affects:          +8
implements:       +6
mentions:         +4
related_to:       +1
```

Tie-breakers:

1. Higher score.
2. More specific type priority: constraint, decision, gotcha, architecture, workflow, question, fact, concept, project, note.
3. Newer `updated_at`.
4. Lexicographic ID.

The exact numeric values may be tuned later, but implementation should keep scoring deterministic and inspectable.

## 11. Token Budget Handling

Aictx should treat `token_budget` as an optional token target for packaging, not as a hard cap.

Token counting:

* Aictx may approximate tokens as `ceil(character_count / 4)`.
* If `token_budget` is omitted, no budget-driven truncation or compression should occur.
* If `token_budget` is provided, lower-priority sections may be compacted or omitted first.
* If preserved high-priority content exceeds the target, render it anyway and report `budget_status: "over_target"` in structured output.

Inclusion priority:

1. Header and provenance.
2. `Must know`.
3. `Do not do`.
4. Relevant constraints.
5. Relevant decisions.
6. Relevant stack.
7. Relevant conventions.
8. Relevant testing.
9. Relevant file layout.
10. Relevant gotchas.
11. Relevant workflows.
12. Abandoned approaches.
13. Open questions.
14. Relevant facts.
15. Relevant files.
16. Stale or superseded memory to avoid.

Packaging rules:

* Never omit the header.
* Never omit `Must know` or `Do not do` entries solely to satisfy a token target.
* Prefer concise bullet summaries over full bodies when an explicit target is provided.
* Include object IDs with summarized entries where possible.
* Do not include budget/truncation explanations in the Markdown context pack; expose token metadata through CLI/MCP JSON fields.

## 12. Context Pack Format

The context pack is Markdown.

Maximum structure:

```markdown
# AI Context Pack

Task: <task>
Generated from: <project id>[, <branch>@<commit> when Git is available]

## Must know

## Do not do

## Relevant decisions

## Relevant constraints

## Relevant gotchas

## Relevant stack

## Relevant conventions

## Relevant testing

## Relevant file layout

## Relevant workflows

## Abandoned approaches

## Relevant facts

## Relevant files

## Open questions

## Stale or superseded memory to avoid
```

Rendering rules:

* Include only non-empty sections by default, except the header.
* Section order must follow the maximum structure shown above.
* Each bullet should be concise and agent-actionable.
* Each bullet should include the source memory ID when useful.
* Stale/superseded warnings must be clearly labeled.
* Rejected memory must not appear unless a future explicit debug mode is added.
* `Relevant files` should include path-like references found in selected memory bodies, source payloads, `facets.applies_to`, and file evidence; omit the section when no file references are available.
* Memories with `facets.category: "abandoned-attempt"` should render as active warnings in `Abandoned approaches`, not as stale memory.
* Token target, estimated token count, budget status, truncation status, and omitted IDs are structured output metadata, not Markdown context.

Example:

```markdown
# AI Context Pack

Task: Fix Stripe webhook retries
Generated from: main@abc123

## Must know

- Billing webhook handlers must be idempotent. (constraint.webhook-idempotency)
- Retry execution happens in the queue worker, not the HTTP handler. (decision.billing-retries)

## Do not do

- Do not retry synchronously inside the HTTP webhook handler.

## Relevant files

- services/billing/src/webhooks/handler.ts
- services/worker/src/jobs/process-stripe-event.ts

## Stale or superseded memory to avoid

- Do not assume webhook retries happen synchronously; that was superseded. (decision.old-webhook-retries)
```

## 13. Saved Context Packs

Saved context packs are optional generated debug artifacts.

Location:

```text
.aictx/context/
```

Rules:

* Controlled by `config.memory.saveContextPacks`.
* Gitignored by default unless `config.git.trackContextPacks` is true.
* Saved context packs are generated data and not canonical memory.
* Saving a context pack must not append to `events.jsonl` in v1.

Suggested filename:

```text
<timestamp>-<slugified-task>.md
```

## 14. Failure Behavior

Index unavailable:

* Return `AICtxIndexUnavailable` when the index is required and cannot be built.
* Include validation details when canonical files caused rebuild failure.

Invalid canonical files:

* Do not serve results from known-invalid canonical data.
* If an older valid index exists but canonical files are invalid, return validation errors instead of stale results.

Dirty memory:

* `load_memory` and `search_memory` may run when `.aictx/` is dirty.
* If dirty canonical files are valid, indexing may include them.
* When Git is available, context pack provenance must include current Git `HEAD`; uncommitted memory state is indicated in API `meta.git.dirty`.
* When Git is unavailable, context pack provenance must mark Git as unavailable and use local project metadata.

## 15. Acceptance Criteria

The indexing and context compiler implementation is valid when:

* Deleting `.aictx/index/` loses no memory.
* `aictx rebuild` recreates the SQLite index from canonical files.
* `aictx rebuild` does not mutate canonical files.
* `search_memory` works with SQLite FTS only.
* `load_memory` produces a Markdown context pack with local project provenance and Git provenance when available.
* `load_memory` treats an explicit token budget as an advisory target and reports token metadata.
* Stale and superseded memory are excluded from `Must know`.
* Rejected memory is excluded by default.
* One-hop relation traversal can add relevant linked memory.
* No indexing or retrieval path requires embeddings, network access, or a cloud account.

## 16. V1 Performance Guardrails

These are product guardrails, not strict benchmark promises.

Reference project size:

```text
500 memory objects
1000 relations
2500 events
average Markdown body under 4 KB
```

Expected local behavior on a typical developer laptop:

* Warm `search_memory` should feel interactive.
* Warm `load_memory` should feel interactive for typical task-specific context packs.
* Full rebuild should complete without noticeable friction at the reference project size.
* Save should not block on network, embeddings, or background services.

Implementation guidance:

* Prefer incremental index updates after saves.
* Use full rebuild as a reliability fallback, not the default path for every read.
* Do not optimize with caching that becomes canonical or hard to rebuild.
* Performance smoke tests should catch accidental order-of-magnitude regressions without making CI flaky.
