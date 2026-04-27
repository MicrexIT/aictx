# Aictx MCP and CLI API Spec

## 1. Purpose

This document defines the v1 user-facing API for Aictx:

* CLI commands
* MCP tools
* Shared request and response shapes
* Structured memory patch format
* Git availability and dirty-state behavior
* Error codes

This spec depends on `storage-format-spec.md` for canonical files, IDs, statuses, relations, event names, and validation rules.

This spec does not define:

* SQLite schema
* Search ranking internals
* Context compiler ranking logic
* Generated context pack internals beyond API shape

Those belong in `indexing-and-context-compiler-spec.md`.

## 2. API Principles

V1 API behavior must follow these rules:

* Git is optional for core memory operations.
* Git is required only for Git-backed commands and provenance.
* Aictx never commits automatically.
* All writes go through structured memory patches.
* The AI agent performs semantic reasoning.
* Aictx validates patches and writes files deterministically.
* MCP exposes a small normalized tool set.
* CLI and MCP must share the same core implementation path.
* The API must be usable without a cloud account, external API, embeddings, or hosted service.

## 3. Runtime Preconditions

All commands and MCP tools must resolve the project root before doing work.

V1 assumes Aictx is being run inside an existing project directory. Aictx does not create or own a separate Git repository. When Git is available, `.aictx/` is stored inside the enclosing project Git worktree. When Git is unavailable, `.aictx/` is stored under the resolved local project root.

Project root resolution:

* Start from the current working directory.
* If inside a Git worktree, use the enclosing Git worktree root as `project_root`.
* If not inside a Git worktree and the command is `init`, use the current working directory as `project_root`.
* If not inside a Git worktree and the command is not `init`, walk upward from the current working directory to find the nearest `.aictx/config.json`; its parent directory is `project_root`.
* Use `<project-root>/.aictx` as the Aictx root.

Errors:

* If a Git-only command is used outside a Git worktree, return `AICtxGitRequired`.
* If `.aictx/` is missing for commands other than `init`, return `AICtxNotInitialized`.
* If storage version is unsupported for a write command, return `AICtxUnsupportedStorageVersion`.

## 4. Shared Response Envelope

MCP tools must return structured JSON responses.

All required CLI commands must render human-readable output by default and support `--json` for the same response envelope.

Success envelope:

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "meta": {
    "project_root": "/repo",
    "aictx_root": "/repo/.aictx",
    "git": {
      "available": true,
      "branch": "main",
      "commit": "abc123",
      "dirty": false
    }
  }
}
```

Error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "AICtxNotInitialized",
    "message": "Aictx is not initialized in this project.",
    "details": {}
  },
  "warnings": [],
  "meta": {
    "project_root": "/repo",
    "aictx_root": "/repo/.aictx",
    "git": {
      "available": false,
      "branch": null,
      "commit": null,
      "dirty": null
    }
  }
}
```

Rules:

* `ok` must be present.
* `warnings` must always be an array.
* `meta.git.available` must be `true` when the project root is inside a Git worktree.
* When `meta.git.available` is `true`, `meta.git.commit` must be the current `HEAD` short or full SHA.
* When `meta.git.available` is `true` but Git is in detached HEAD state, `meta.git.branch` must be `null`; it must never be the literal string `HEAD`.
* When `meta.git.available` is `false`, `meta.git.branch`, `meta.git.commit`, and `meta.git.dirty` must be `null`.
* When Git is available, `meta.git.dirty` means `.aictx/` has uncommitted changes, not that the whole repository is dirty.
* Paths in JSON responses should be relative to the project root unless absolute paths are explicitly needed for diagnostics.

## 5. CLI Commands

### 5.1 `aictx init`

Purpose:

Initialize `.aictx/` inside the current project root.

Syntax:

```bash
aictx init [--json]
```

Behavior:

* Detect whether the current directory is inside a Git worktree.
* If Git is available, initialize at the Git worktree root.
* If Git is unavailable, initialize in the current working directory.
* Create `.aictx/` if missing.
* Create default memory files and JSON sidecars.
* Create `config.json`.
* Create JSON schemas.
* Create empty `events.jsonl`.
* Create generated directories.
* If Git is available, add or recommend `.gitignore` entries for `.aictx/index/`, `.aictx/context/`, and `.aictx/.lock`.
* Build the initial local index if possible.
* Do not create a Git commit.

If `.aictx/` already exists:

* If valid, return success with a warning.
* If invalid, return `AICtxAlreadyInitializedInvalid`.

Success data:

```json
{
  "created": true,
  "files_created": [
    ".aictx/config.json",
    ".aictx/events.jsonl"
  ],
  "gitignore_updated": true,
  "git_available": true,
  "index_built": true,
  "next_steps": [
    "Run `aictx load \"your task\"` before a coding task.",
    "Use MCP `save_memory_patch` or `aictx save --stdin` with a structured patch after meaningful work.",
    "Review memory changes in `.aictx/`; in Git projects, use `aictx diff` before committing.",
    "Optionally copy generated repo-provided agent guidance from integrations/ into your coding-agent setup."
  ]
}
```

### 5.2 `aictx load`

Purpose:

Compile task-specific memory into a context pack.

Syntax:

```bash
aictx load "<task>" [--token-budget <number>] [--json]
```

Behavior:

* Require initialized `.aictx/`.
* Load only local canonical files and generated local index data.
* Rebuild or refresh the index first if config allows and the index is missing/stale.
* Return a Markdown context pack by default.
* Include Git provenance in the context pack when Git is available.
* If Git is unavailable, include local project provenance and mark Git provenance as unavailable.
* Exclude stale, superseded, rejected, and conflicted memory from `Must know` by default.

JSON success data:

```json
{
  "task": "Fix Stripe webhook retries",
  "token_budget": 6000,
  "context_pack": "# AI Context Pack\n...",
  "source": {
    "project": "project.billing-api",
    "git_available": true,
    "branch": "main",
    "commit": "abc123"
  },
  "included_ids": ["decision.billing-retries"],
  "excluded_ids": ["decision.old-webhook-retries"]
}
```

### 5.3 `aictx save`

Purpose:

Write memory updates from a structured patch.

Syntax:

```bash
aictx save --file <path> [--json]
aictx save --stdin [--json]
```

Minimal stdin patch example:

```json
{
  "source": {
    "kind": "agent",
    "task": "Document billing retry behavior"
  },
  "changes": [
    {
      "op": "create_object",
      "type": "note",
      "title": "Billing retries run in the worker",
      "body": "Billing retry execution happens in the queue worker, not inside the HTTP webhook handler."
    }
  ]
}
```

Behavior:

* Require initialized `.aictx/`.
* Require exactly one of `--file` or `--stdin`.
* Parse the patch as JSON.
* Validate the patch against `patch.schema.json`.
* Reject writes if `.aictx/` contains conflict markers.
* When Git is available, reject writes if `.aictx/` contains unresolved Git conflicts.
* When Git is available, reject writes if the patch would overwrite modified memory files that are already dirty, unless a future explicit force option is added.
* Apply the same write path as MCP `save_memory_patch`.
* Append semantic events to `events.jsonl`.
* Update hashes.
* Update or rebuild the local index when configured.
* Do not create a Git commit.

Success data:

```json
{
  "files_changed": [
    ".aictx/memory/decisions/billing-retries.md",
    ".aictx/memory/decisions/billing-retries.json",
    ".aictx/events.jsonl"
  ],
  "memory_created": ["decision.billing-retries"],
  "memory_updated": [],
  "memory_deleted": [],
  "relations_created": ["rel.decision-billing-retries-requires-constraint-webhook-idempotency"],
  "relations_updated": [],
  "relations_deleted": [],
  "events_appended": 2,
  "index_updated": true
}
```

### 5.4 `aictx diff`

Purpose:

Show memory changes only.

Syntax:

```bash
aictx diff [--json]
```

Behavior:

* Require Git; outside a Git worktree return `AICtxGitRequired`.
* Equivalent in scope to `git diff -- .aictx/`.
* Must not show non-Aictx repository changes.
* Must work when `.aictx/` has uncommitted changes.

JSON success data:

```json
{
  "diff": "diff --git ...",
  "changed_files": [".aictx/events.jsonl"],
  "changed_memory_ids": ["decision.billing-retries"],
  "changed_relation_ids": []
}
```

### 5.5 `aictx check`

Purpose:

Validate canonical storage and generated index health.

Syntax:

```bash
aictx check [--json]
```

Behavior:

* Validate rules from `storage-format-spec.md`.
* Detect Git conflict markers in canonical files.
* Verify generated index can be opened or rebuilt.
* Must not mutate canonical files.

Success data:

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

If validation fails, the command should return a non-zero exit code and `valid: false`.

### 5.6 `aictx rebuild`

Purpose:

Rebuild generated local indexes from canonical files.

Syntax:

```bash
aictx rebuild [--json]
```

Behavior:

* Validate canonical files enough to safely rebuild.
* Delete or replace generated index data.
* Rebuild from Markdown, JSON sidecars, relations, and events.
* Do not mutate canonical files.
* Must not require network access.

Success data:

```json
{
  "index_rebuilt": true,
  "objects_indexed": 12,
  "relations_indexed": 8,
  "events_indexed": 24,
  "event_appended": false
}
```

### 5.7 `aictx history`

Purpose:

Show Git-backed memory history.

Syntax:

```bash
aictx history [--limit <number>] [--json]
```

Behavior:

* Require Git; outside a Git worktree return `AICtxGitRequired`.
* Show commits that changed `.aictx/`.
* Must not include commits that only changed non-Aictx files.

JSON success data:

```json
{
  "commits": [
    {
      "commit": "abc123",
      "short_commit": "abc123",
      "author": "User <user@example.com>",
      "timestamp": "2026-04-25T14:00:00+02:00",
      "subject": "Update AI project memory"
    }
  ]
}
```

### 5.8 `aictx restore`

Purpose:

Restore `.aictx/` from an explicit Git commit.

Syntax:

```bash
aictx restore <commit> [--json]
```

Behavior:

* Require Git; outside a Git worktree return `AICtxGitRequired`.
* Require `<commit>`.
* Restore only `.aictx/`.
* Must not affect non-Aictx files.
* Refuse if `.aictx/` has uncommitted changes, unless a future explicit force option is added.
* Do not create a Git commit.
* Rebuild generated index after restore when possible.

Success data:

```json
{
  "restored_from": "abc123",
  "files_changed": [".aictx/config.json"],
  "index_rebuilt": true
}
```

### 5.9 `aictx rewind`

Purpose:

Restore `.aictx/` to the previous committed `.aictx/` state.

Syntax:

```bash
aictx rewind [--json]
```

Behavior:

* Require Git; outside a Git worktree return `AICtxGitRequired`.
* Find the previous Git commit that changed `.aictx/`.
* Restore `.aictx/` from that commit.
* Follow the same safety rules as `aictx restore`.

Success data:

```json
{
  "restored_from": "abc123",
  "files_changed": [".aictx/events.jsonl"],
  "index_rebuilt": true
}
```

### 5.10 Optional Commands

Optional v1 commands may be implemented if they use the same read paths as MCP:

```bash
aictx search "<query>" [--limit <number>] [--json]
aictx stale [--json]
aictx inspect <id> [--json]
aictx graph <id> [--json]
```

These commands must not mutate canonical storage.

Minimum behavior:

* `aictx search` is the CLI equivalent of `search_memory`.
* `aictx stale` lists stale, superseded, and rejected memory objects.
* `aictx inspect <id>` shows one memory object plus direct relations.
* `aictx graph <id>` shows relation neighborhoods for debugging only.

## 6. MCP Tools

V1 MCP must expose only these required tools:

* `load_memory`
* `search_memory`
* `save_memory_patch`
* `diff_memory`

The MCP server must not expose arbitrary shell access, arbitrary filesystem writes, or low-level graph mutation tools.

### 6.1 `load_memory`

Input:

```json
{
  "task": "Fix Stripe webhook retries",
  "token_budget": 6000,
  "mode": "coding"
}
```

Input fields:

* `task` is required.
* `token_budget` is optional and defaults to `config.memory.defaultTokenBudget`.
* `mode` is optional and defaults to `coding`.

Behavior:

* Same core behavior as `aictx load`.
* Must return Markdown context pack plus structured references.

Output data:

```json
{
  "context_pack": "# AI Context Pack\n...",
  "source": {
    "branch": "main",
    "commit": "abc123"
  },
  "included_ids": ["decision.billing-retries"],
  "excluded_ids": ["decision.old-webhook-retries"]
}
```

### 6.2 `search_memory`

Input:

```json
{
  "query": "Stripe webhook idempotency",
  "limit": 10
}
```

Input fields:

* `query` is required.
* `limit` is optional and defaults to `10`.

Behavior:

* Search local memory using generated local index data.
* Must not require embeddings or network access.
* Must not mutate canonical storage.

Output data:

```json
{
  "matches": [
    {
      "id": "constraint.webhook-idempotency",
      "type": "constraint",
      "status": "active",
      "title": "Webhook processing must be idempotent",
      "snippet": "Stripe may deliver duplicate events...",
      "body_path": ".aictx/memory/constraints/webhook-idempotency.md"
    }
  ]
}
```

### 6.3 `save_memory_patch`

Input:

```json
{
  "patch": {
    "source": {
      "kind": "agent",
      "task": "Fix Stripe webhook retries",
      "commit": "abc123"
    },
    "changes": [
      {
        "op": "create_object",
        "type": "note",
        "title": "Stripe webhook retry follow-up",
        "body": "Retry behavior should be checked after the worker change."
      }
    ]
  }
}
```

Behavior:

* Same core behavior as `aictx save --stdin`.
* Validate and apply the structured patch.
* Must not infer semantic memory from code diffs.
* Must not commit.
* Must reject writes on unresolved `.aictx/` conflict markers.
* When Git is available, must reject writes on unresolved `.aictx/` Git conflicts.
* When Git is available, must reject writes that would overwrite dirty files touched by the patch.

Output data:

```json
{
  "files_changed": [".aictx/events.jsonl"],
  "memory_created": ["note.stripe-webhook-retry-follow-up"],
  "memory_updated": [],
  "memory_deleted": [],
  "relations_created": [],
  "relations_updated": [],
  "relations_deleted": [],
  "events_appended": 1,
  "index_updated": true
}
```

### 6.4 `diff_memory`

Input:

```json
{}
```

Behavior:

* Require Git; outside a Git worktree return `AICtxGitRequired`.
* Same core behavior as `aictx diff --json`.
* Must not mutate canonical storage.

Output data:

```json
{
  "diff": "diff --git ...",
  "changed_files": [".aictx/events.jsonl"],
  "changed_memory_ids": [],
  "changed_relation_ids": []
}
```

## 7. Structured Patch Format

The structured patch is the only v1 write contract.

Top-level shape:

```json
{
  "source": {
    "kind": "agent",
    "task": "Fix Stripe webhook retries",
    "commit": "abc123"
  },
  "changes": [
    {
      "op": "create_object",
      "type": "note",
      "title": "Stripe webhook retry follow-up",
      "body": "Retry behavior should be checked after the worker change."
    }
  ]
}
```

Required top-level fields:

* `source`
* `changes`

Source fields:

* `kind` is required and must be `agent`, `user`, `cli`, `mcp`, or `system`.
* `task` is optional.
* `commit` is optional but recommended.

Rules:

* `changes` must be a non-empty array.
* Changes are applied in order.
* If any change fails validation, the entire patch must fail before canonical files are modified.
* Aictx must perform deterministic file writes.
* Generated IDs must follow `storage-format-spec.md`.
* Every applied change must append an event unless the operation is a no-op.

### 7.1 `create_object`

Example:

```json
{
  "op": "create_object",
  "id": "decision.billing-retries",
  "type": "decision",
  "status": "active",
  "title": "Billing retries moved to queue worker",
  "body": "Stripe webhook retries now happen in the queue worker.",
  "scope": {
    "kind": "project",
    "project": "project.billing-api",
    "branch": null,
    "task": null
  },
  "tags": ["billing", "stripe"]
}
```

Required fields:

* `op`
* `type`
* `title`
* `body`

Optional fields:

* `id`
* `status`
* `scope`
* `tags`
* `source`

Defaults:

* `status` defaults to `active`, except `question` defaults to `open`.
* `scope.kind` defaults to `project`.
* `scope.project` defaults to `config.project.id` from `.aictx/config.json`.
* `scope.branch` defaults to `null`.
* `scope.task` defaults to `null`.
* `id` is generated when omitted.

Event:

* `memory.created`

### 7.2 `update_object`

Example:

```json
{
  "op": "update_object",
  "id": "decision.billing-retries",
  "title": "Billing retries run in the queue worker",
  "body": "Updated body text.",
  "tags": ["billing", "stripe", "queue"]
}
```

Required fields:

* `op`
* `id`

Optional update fields:

* `status`
* `title`
* `body`
* `scope`
* `tags`
* `source`
* `superseded_by`

Rules:

* Unknown object ID is an error.
* Omitted optional fields keep their existing values.
* Updating `body` updates the Markdown file.
* Updating metadata updates the JSON sidecar.

Event:

* `memory.updated`

### 7.3 `mark_stale`

Example:

```json
{
  "op": "mark_stale",
  "id": "decision.old-webhook-retries",
  "reason": "Retries moved to worker."
}
```

Required fields:

* `op`
* `id`
* `reason`

Behavior:

* Set object status to `stale`.
* Preserve body content.

Event:

* `memory.marked_stale`

### 7.4 `supersede_object`

Example:

```json
{
  "op": "supersede_object",
  "id": "decision.old-webhook-retries",
  "superseded_by": "decision.billing-retries",
  "reason": "Retries moved to worker."
}
```

Required fields:

* `op`
* `id`
* `superseded_by`
* `reason`

Behavior:

* Set object status to `superseded`.
* Set `superseded_by`.
* Create a `supersedes` relation if one does not already exist.

Event:

* `memory.superseded`

### 7.5 `delete_object`

Physical deletion is discouraged but defined for completeness.

Example:

```json
{
  "op": "delete_object",
  "id": "note.bad-import"
}
```

Required fields:

* `op`
* `id`

Behavior:

* Delete the object Markdown file.
* Delete the object JSON sidecar.
* Reject the operation if active relations still reference the object.

Event:

* `memory.deleted`

### 7.6 `create_relation`

Example:

```json
{
  "op": "create_relation",
  "id": "rel.decision-billing-retries-requires-constraint-webhook-idempotency",
  "from": "decision.billing-retries",
  "predicate": "requires",
  "to": "constraint.webhook-idempotency",
  "confidence": "high"
}
```

Required fields:

* `op`
* `from`
* `predicate`
* `to`

Optional fields:

* `id`
* `status`
* `confidence`
* `evidence`

Defaults:

* `status` defaults to `active`.
* `id` is generated when omitted.

Event:

* `relation.created`

### 7.7 `update_relation`

Required fields:

* `op`
* `id`

Optional update fields:

* `status`
* `confidence`
* `evidence`

Rules:

* Unknown relation ID is an error.
* `from`, `predicate`, and `to` are immutable in v1. To change them, delete and recreate the relation.

Event:

* `relation.updated`

### 7.8 `delete_relation`

Required fields:

* `op`
* `id`

Behavior:

* Delete the relation JSON file.

Event:

* `relation.deleted`

## 8. Git Availability and Dirty-State Behavior

Core memory behavior must work without Git. Git behavior is part of the API contract when the project root is inside a Git worktree.

Rules:

* `init`, `load_memory`, `search_memory`, `save_memory_patch`, `check`, and `rebuild` must work outside Git.
* `diff_memory`, `aictx diff`, `aictx history`, `aictx restore`, and `aictx rewind` require Git and return `AICtxGitRequired` outside Git.
* When Git is available, `load_memory` and `search_memory` may run when `.aictx/` is dirty.
* `save_memory_patch` must reject writes when `.aictx/` has conflict markers.
* When Git is available, `save_memory_patch` must reject writes when `.aictx/` has unresolved Git conflicts.
* When Git is available, `save_memory_patch` must reject writes that would overwrite dirty files touched by the patch.
* When Git is available, `diff_memory` must show only `.aictx/` changes.
* When Git is available, `restore` and `rewind` must refuse to run when `.aictx/` is dirty.
* No command or MCP tool may run `git commit`.

Dirty file detection:

* A file is dirty if Git reports it modified, added, deleted, renamed, or unmerged under `.aictx/`.
* Generated and local ignored files under `.aictx/index/`, `.aictx/context/`, and `.aictx/.lock` do not count as dirty.

Conflict detection:

* Conflict markers in canonical files are conflicts.
* When Git is available, Git unmerged state under `.aictx/` is a conflict.

## 9. Error Codes

V1 error codes:

* `AICtxGitRequired`
* `AICtxNotInitialized`
* `AICtxAlreadyInitializedInvalid`
* `AICtxUnsupportedStorageVersion`
* `AICtxInvalidConfig`
* `AICtxInvalidJson`
* `AICtxInvalidJsonl`
* `AICtxSchemaValidationFailed`
* `AICtxValidationFailed`
* `AICtxConflictDetected`
* `AICtxDirtyMemory`
* `AICtxPatchRequired`
* `AICtxPatchInvalid`
* `AICtxUnknownPatchOperation`
* `AICtxObjectNotFound`
* `AICtxRelationNotFound`
* `AICtxDuplicateId`
* `AICtxInvalidRelation`
* `AICtxSecretDetected`
* `AICtxIndexUnavailable`
* `AICtxLockBusy`
* `AICtxGitOperationFailed`
* `AICtxInternalError`

CLI exit code rules:

* `0` means success.
* `1` means validation, patch, or user-correctable error.
* `2` means usage error.
* `3` means Git or storage precondition error.

## 10. Acceptance Criteria

The v1 API is valid when:

* `aictx init` creates storage from `storage-format-spec.md` inside Git and non-Git project directories.
* `aictx load` and `load_memory` return equivalent context data.
* `aictx save --stdin`, `aictx save --file`, and `save_memory_patch` use the same write path.
* Save operations write canonical files, append events, and update hashes.
* In Git projects, save operations leave changes uncommitted.
* In Git projects, `aictx diff` and `diff_memory` show only `.aictx/` changes.
* `aictx check` reports storage validation errors without mutating canonical files.
* Outside Git, Git-only commands return `AICtxGitRequired`.
* In Git projects, `aictx restore <commit>` restores only `.aictx/`.
* In Git projects, `aictx rewind` restores the previous committed `.aictx/` state.
* MCP exposes no arbitrary shell or filesystem write tool.
* No API path requires embeddings, network access, or a cloud account.
