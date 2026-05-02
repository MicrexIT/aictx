# Aictx Storage Format Spec

## 1. Purpose

This document defines the v2 on-disk storage format for Aictx.

Aictx stores durable project memory as local files under `.aictx/`. The storage format must be readable by humans, deterministic for tools, rebuildable into generated indexes, and safe to review or revert with Git when Git is available.

This spec owns:

* `.aictx/` directory layout
* Canonical file types
* Memory object JSON sidecars
* Markdown body rules
* Relation JSON files
* `events.jsonl`
* Storage versioning
* Content hashing
* Validation rules

This spec does not define:

* CLI command syntax
* MCP tool inputs/outputs
* Patch operation wire format
* SQLite schema
* Ranking and context compilation

Those belong in `mcp-and-cli-api-spec.md` and `indexing-and-context-compiler-spec.md`.

## 2. Storage Principles

Storage must follow these rules:

* Git is optional for core storage.
* `.aictx/` lives inside the resolved local project root.
* When Git is available, the project root is the enclosing Git worktree root.
* Aictx does not create or own a separate Git repository.
* Markdown owns prose.
* JSON owns structure.
* JSONL owns semantic event history.
* SQLite and generated context packs are not canonical.
* No YAML is used in the core format.
* Canonical files must be human-reviewable with or without Git.
* Files committed to Git must also remain human-reviewable.
* Generated files must be rebuildable from canonical files.
* Aictx must not silently resolve disagreements between Markdown and JSON.

## 3. Directory Layout

Storage uses this layout:

```text
.aictx/
  config.json
  memory/
    project.md
    project.json
    architecture.md
    architecture.json
    decisions/
      billing-retries.md
      billing-retries.json
    constraints/
      webhook-idempotency.md
      webhook-idempotency.json
    questions/
      retry-backoff.md
      retry-backoff.json
    facts/
    gotchas/
      webhook-duplicates.md
      webhook-duplicates.json
    workflows/
      release-checklist.md
      release-checklist.json
    notes/
      stripe-webhook-behavior.md
      stripe-webhook-behavior.json
    concepts/
  relations/
    decision-billing-retries-requires-constraint-webhook-idempotency.json
  events.jsonl
  schema/
    config.schema.json
    object.schema.json
    relation.schema.json
    event.schema.json
    patch.schema.json
  index/
    aictx.sqlite
  context/
  exports/
    obsidian/
```

Canonical and tracked by Git when Git is available:

```text
.aictx/config.json
.aictx/memory/
.aictx/relations/
.aictx/events.jsonl
.aictx/schema/
```

Generated and gitignored when Git is available:

```text
.aictx/index/
.aictx/context/
.aictx/exports/
.aictx/recovery/
.aictx/.lock
```

Recommended `.gitignore` entries when Git is available:

```gitignore
.aictx/index/
.aictx/context/
.aictx/exports/
.aictx/recovery/
.aictx/.lock
```

## 4. Config Format

`.aictx/config.json` is canonical and should be tracked when Git is available.

V2 example:

```json
{
  "version": 2,
  "project": {
    "id": "project.billing-api",
    "name": "Billing API"
  },
  "memory": {
    "defaultTokenBudget": 6000,
    "autoIndex": true,
    "saveContextPacks": false
  },
  "git": {
    "trackContextPacks": false
  }
}
```

Required fields:

* `version`
* `project.id`
* `project.name`
* `memory.defaultTokenBudget`
* `memory.autoIndex`
* `memory.saveContextPacks`
* `git.trackContextPacks`

Rules:

* `project.id` should default to `project.<slugified-project-root-basename>`.
* `project.id` is the default `scope.project` label.
* Once written, `project.id` must be treated as stable project identity and must not be recomputed merely because the directory path or Git worktree path changes.
* `project.id` is a local project namespace in v1, not a globally unique account identifier.
* Future global or cross-project indexing must disambiguate projects through an explicit registry or source-root record, not by assuming `project.id` is globally unique.
* `git.trackContextPacks` applies only when Git is available.

Version behavior:

* Missing `version` is an error.
* `version > supported_version` must refuse writes.
* `version < supported_version` must be upgraded before writes that require the newer schema.
* Read-only inspection may proceed when safe.
* Aictx must not silently rewrite storage formats; use `aictx upgrade` for v1-to-v2 migration.

## 5. Memory Objects

Each memory object is stored as:

```text
<object>.md
<object>.json
```

The Markdown file contains prose. The JSON sidecar contains canonical metadata and points to the Markdown body.

### 5.1 Object Types

Object types:

* `project`
* `architecture`
* `decision`
* `constraint`
* `question`
* `fact`
* `gotcha`
* `workflow`
* `note`
* `concept`

Recommended directories:

```text
project        -> .aictx/memory/project.*
architecture   -> .aictx/memory/architecture.*
decision       -> .aictx/memory/decisions/
constraint     -> .aictx/memory/constraints/
question       -> .aictx/memory/questions/
fact           -> .aictx/memory/facts/
gotcha         -> .aictx/memory/gotchas/
workflow       -> .aictx/memory/workflows/
note           -> .aictx/memory/notes/
concept        -> .aictx/memory/concepts/
```

`gotcha` captures known failure modes, traps, recurring bugs, and behavior future agents should avoid. `workflow` captures repeated project procedures such as release steps, debugging paths, migrations, local setup, or recurring maintenance. Do not add `history` or `task-note` object types; use Git/events/statuses for history and branch/task scope for temporary context.

V2 keeps the broad object type taxonomy and adds object-level facets for more specific agent-memory categories.

### 5.2 Object Statuses

General statuses:

* `active`
* `draft`
* `stale`
* `superseded`
* `rejected`

Question-specific statuses:

* `open`
* `closed`

Rules:

* Non-question objects should use `active`, `draft`, `stale`, `superseded`, or `rejected`.
* Question objects may use `open` or `closed` in addition to general statuses.
* `superseded` objects should identify their replacement with `superseded_by` and/or a `supersedes` relation.
* Physical deletion is allowed only through an explicit delete operation and should be rare.

### 5.3 Object IDs

Every memory object must have a stable ID.

ID format:

```text
<type>.<slug>
```

Examples:

```text
project.billing-api
architecture.current
decision.billing-retries
constraint.webhook-idempotency
question.retry-backoff
fact.stripe-sends-duplicates
note.stripe-webhook-behavior
concept.billing
```

Rules:

* IDs are canonical.
* IDs must not depend on file paths.
* IDs must be unique across all memory objects.
* IDs must match `^[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9-]*$`.
* If an ID is omitted during creation, Aictx should generate `<type>.<slugified-title>`.
* On collision, Aictx should append a deterministic numeric suffix such as `-2`.

### 5.4 Filenames

Object Markdown and JSON sidecars must share a basename.

Example:

```text
.aictx/memory/decisions/billing-retries.md
.aictx/memory/decisions/billing-retries.json
```

Rules:

* Filenames are not canonical.
* Basenames should be slugified from the title or ID slug.
* Basenames must use lowercase ASCII letters, numbers, and hyphens.
* Basenames must not contain path separators.
* Moving files without changing IDs is allowed if `body_path` is updated.

## 6. Object JSON Sidecar

Example:

```json
{
  "id": "decision.billing-retries",
  "type": "decision",
  "status": "active",
  "title": "Billing retries moved to queue worker",
  "body_path": "memory/decisions/billing-retries.md",
  "scope": {
    "kind": "project",
    "project": "project.billing-api",
    "branch": null,
    "task": null
  },
  "tags": ["billing", "stripe", "webhooks"],
  "facets": {
    "category": "decision-rationale",
    "applies_to": ["src/webhooks/stripe.ts", "src/workers/billing-retries.ts"],
    "load_modes": ["coding", "debugging"]
  },
  "evidence": [
    {
      "kind": "file",
      "id": "src/workers/billing-retries.ts"
    }
  ],
  "source": {
    "kind": "agent",
    "task": "Fix Stripe webhook retries",
    "commit": "abc123"
  },
  "superseded_by": null,
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "created_at": "2026-04-25T14:00:00+02:00",
  "updated_at": "2026-04-25T14:00:00+02:00"
}
```

Required fields:

* `id`
* `type`
* `status`
* `title`
* `body_path`
* `scope`
* `content_hash`
* `created_at`
* `updated_at`

Optional fields:

* `tags`
* `facets`
* `evidence`
* `source`
* `superseded_by`

Rules:

* `body_path` is relative to `.aictx/`.
* `body_path` must point to a Markdown file.
* `title` in JSON is canonical.
* Markdown H1 should match `title`; mismatch is a warning.
* `created_at` and `updated_at` must be ISO 8601 strings with timezone offsets.
* `tags` must be lowercase slug strings.
* `facets.category` should classify the durable claim with one of the v2 facet categories.
* `facets.applies_to` should list relevant paths, globs, or subsystem hints when the memory is not globally applicable.
* `facets.load_modes` may restrict boosts to `coding`, `debugging`, `review`, `architecture`, or `onboarding`.
* `evidence` should link durable claims to supporting files, commits, memory objects, relations, or tasks.
* Unknown top-level fields are invalid.

V2 facet categories:

* `project-description`
* `architecture`
* `stack`
* `convention`
* `file-layout`
* `product-feature`
* `testing`
* `decision-rationale`
* `abandoned-attempt`
* `workflow`
* `gotcha`
* `debugging-fact`
* `concept`
* `open-question`

Rules:

* Use facets instead of adding narrower object types.
* Represent current product capabilities as `concept` objects with `facets.category: "product-feature"`.
* Use `mark_stale` for removed product features and `supersede_object` when a new feature replaces an older one.
* Represent tried-and-abandoned approaches as active memory with `facets.category: "abandoned-attempt"`.
* Use `stale` or `superseded` only when the memory object itself is no longer valid.
* Leave `evidence` empty during conservative migrations rather than inventing support.

Scope rules:

* `scope` must be an object with `kind`, `project`, `branch`, and `task` keys.
* `scope.kind` must be `project`, `branch`, or `task`.
* `scope.project` must be the local Aictx project ID, such as `project.billing-api`.
* `aictx init` should default `config.project.id` from the project root directory basename.
* `scope.kind: "project"` means the memory applies to the local project regardless of branch or task.
* `scope.kind: "branch"` means the memory applies only when the current Git branch is known and matches `scope.branch`.
* `scope.kind: "task"` means the memory applies only when the current task matches `scope.task` strongly enough for the context compiler.
* Project-scoped memory should have `branch: null` and `task: null`.
* Branch-scoped memory must have a non-empty `branch` and `task: null`.
* Task-scoped memory must have a non-empty `task`; `branch` may be a string or `null`.
* Branch scope must not be used when Git is unavailable.
* Branch scope must not match when Git is in detached HEAD state because there is no current branch name.
* Global, workspace, and cross-project scopes are reserved for future versions and must not appear in object sidecars.

## 7. Markdown Body Format

Markdown body files are canonical prose.

Rules:

* Markdown files must not contain YAML frontmatter.
* The first heading should be an H1.
* The H1 should match the JSON sidecar `title`.
* Markdown may contain normal headings, paragraphs, lists, and code blocks.
* Machine-owned metadata must not be duplicated in Markdown.

Example:

```markdown
# Billing retries moved to queue worker

Stripe webhook retries now happen in the queue worker instead of inside the HTTP handler.

## Context

The HTTP webhook handler needs to respond quickly to Stripe.

## Decision

Incoming Stripe events are stored and enqueued. Retry execution happens in the queue worker.

## Consequences

- Webhook handlers must remain fast.
- Processing must be idempotent.
- Queue retry policy affects billing reliability.
```

## 8. Relations

Relations are stored as one JSON file per relation under `.aictx/relations/`.

Example:

```json
{
  "id": "rel.decision-billing-retries-requires-constraint-webhook-idempotency",
  "from": "decision.billing-retries",
  "predicate": "requires",
  "to": "constraint.webhook-idempotency",
  "status": "active",
  "confidence": "high",
  "evidence": [
    {
      "kind": "memory",
      "id": "decision.billing-retries"
    }
  ],
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "created_at": "2026-04-25T14:00:00+02:00",
  "updated_at": "2026-04-25T14:00:00+02:00"
}
```

Required fields:

* `id`
* `from`
* `predicate`
* `to`
* `status`
* `created_at`
* `updated_at`

Optional fields:

* `confidence`
* `evidence`
* `content_hash`

Allowed predicates:

* `affects`
* `requires`
* `depends_on`
* `supersedes`
* `conflicts_with`
* `mentions`
* `implements`
* `related_to`

Relation status values:

* `active`
* `stale`
* `rejected`

Confidence values:

* `low`
* `medium`
* `high`

Rules:

* Relation IDs must match `^rel\.[a-z0-9][a-z0-9-]*$`.
* `from` must reference an existing memory object ID.
* `to` must reference an existing memory object ID.
* Relation IDs must be unique.
* Predicate direction matters.
* Duplicate equivalent relations are invalid.
* `related_to` is allowed as a fallback but should not be overused.

## 9. Events JSONL

`.aictx/events.jsonl` is canonical semantic history and should be tracked when Git is available.

Each line must be valid JSON. Blank lines are invalid.

Example:

```jsonl
{"event":"memory.created","id":"decision.billing-retries","actor":"agent","timestamp":"2026-04-25T14:00:00+02:00","payload":{"title":"Billing retries moved to queue worker"}}
{"event":"relation.created","relation_id":"rel.decision-billing-retries-requires-constraint-webhook-idempotency","actor":"agent","timestamp":"2026-04-25T14:01:00+02:00","payload":{"from":"decision.billing-retries","predicate":"requires","to":"constraint.webhook-idempotency"}}
{"event":"memory.marked_stale","id":"decision.old-webhook-retries","actor":"agent","reason":"Retries moved to worker","timestamp":"2026-04-25T14:02:00+02:00"}
```

Allowed event types:

* `memory.created`
* `memory.updated`
* `memory.marked_stale`
* `memory.superseded`
* `memory.rejected`
* `memory.deleted`
* `relation.created`
* `relation.updated`
* `relation.deleted`
* `index.rebuilt`
* `context.generated`

Required event fields:

* `event`
* `actor`
* `timestamp`

Memory event requirements:

* `memory.*` events must include `id`.

Relation event requirements:

* `relation.*` events must include `relation_id`.

Generated-data event requirements:

* `index.rebuilt` and `context.generated` do not require `id` or `relation_id`.
* If they reference a memory object, relation, or context pack, that reference should be placed in `payload`.

Optional event fields:

* `reason`
* `payload`

Rules:

* `timestamp` must be ISO 8601 with timezone offset.
* `actor` should be `agent`, `user`, `cli`, `mcp`, or `system`.
* Events are append-only in normal operation.
* `index.rebuilt` is allowed by the event vocabulary, but v1 rebuild commands must not append it because rebuilding generated files must not mutate canonical files.
* When Git is available, Git conflicts in `events.jsonl` are resolved as normal Git conflicts.
* `aictx check` must fail on invalid JSONL or conflict markers.

## 10. Content Hashing

Each memory object must include `content_hash`.

Object hash:

```text
sha256(canonical_json(object_without_content_hash) + "\n" + markdown_body)
```

Relation hash, when present:

```text
sha256(canonical_json(relation_without_content_hash))
```

Rules:

* Canonical JSON must use sorted object keys.
* Canonical JSON must omit insignificant whitespace.
* Hash strings must use the `sha256:<hex>` format.
* Volatile generated data must not be included in hashes.
* `updated_at` is included in v1 object hashes because it is canonical metadata.
* A Markdown body edit without sidecar hash update is a validation warning.
* A missing hash is a validation error for memory objects.
* Relation hashes are optional in v1, but if present they must validate.

## 11. Validation Rules

`aictx check` must validate canonical storage.

Errors:

* `.aictx/config.json` is missing.
* `config.json.version` is missing or unsupported.
* Required canonical directories are missing.
* JSON file is invalid JSON.
* JSON file does not match its schema.
* Markdown body file is missing.
* Object ID is missing, invalid, or duplicated.
* Relation ID is missing, invalid, or duplicated.
* Relation endpoint does not exist.
* Relation predicate is not allowed.
* Object status is not allowed for its type.
* `events.jsonl` contains invalid JSON.
* Any canonical file contains conflict markers.
* Memory object `content_hash` is missing.

Warnings:

* Markdown H1 differs from JSON `title`.
* Memory object `content_hash` does not match current body/metadata.
* Relation hash does not match when present.
* `related_to` appears excessively.
* `superseded` object has no `superseded_by` or `supersedes` relation.
* Generated paths are not gitignored when Git is available.

V1 must not auto-fix validation failures unless an explicit future fix command is introduced.

## 12. Generated and Local Data

Generated and local runtime data is not canonical.

Generated/local locations:

```text
.aictx/index/
.aictx/context/
.aictx/exports/obsidian/
.aictx/recovery/
.aictx/.lock
```

Rules:

* Generated and local runtime data should be gitignored when Git is available.
* Deleting generated data must not lose memory.
* Generated data must be rebuildable from canonical files.
* The Obsidian projection export is generated data and must not be read as canonical memory.
* Generated Obsidian files may contain JSON frontmatter inside `---` delimiters for Obsidian compatibility.
* Generated Obsidian frontmatter must not affect canonical Markdown validation, content hashes, indexing, events, or patch writes.
* Embeddings are not part of v1 storage.
* Future embedding caches must remain generated, optional, and non-canonical.

## 13. V1 Acceptance Criteria

The storage format is valid when:

* A fresh `aictx init` can create the full `.aictx/` structure inside Git and non-Git project directories, including the starter project-to-architecture relation.
* Canonical files are readable and reviewable as local files.
* Canonical files are readable and reviewable in Git when Git is available.
* Dirty save overwrites and save-time repairs are copied to `.aictx/recovery/` before Aictx continues.
* `aictx check` can validate all canonical files.
* The local index can be deleted and rebuilt from canonical files.
* Memory object prose can be edited manually in Markdown.
* Manual Markdown edits are detected by hash validation.
* Relations cannot point to missing memory objects.
* `events.jsonl` is valid JSONL and tracked when Git is available.
* The Obsidian projection can be deleted and rebuilt without losing memory.
* No cloud account, external API, embedding provider, or hosted service is required.
