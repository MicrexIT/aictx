# Aictx MCP and CLI API Spec

## 1. Purpose

This document defines the v1 user-facing API for Aictx:

* CLI commands
* MCP tools
* Shared request and response shapes
* Structured memory patch format
* Git availability and dirty-state behavior
* Error codes
* CLI-only local viewer entrypoint

This spec depends on `storage-format-spec.md` for canonical files, IDs, statuses, relations, event names, and validation rules. Local viewer details are owned by `local-viewer-spec.md`.

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
* AI agents must be able to reach every supported Aictx capability through either MCP or CLI.
* CLI is the default agent path for routine memory load, search, save, and diff workflows.
* MCP is a supported integration path when the agent client has already launched and connected to `aictx-mcp`.
* CLI is the supported path for setup, maintenance, recovery, export, inspection, registry management, local viewing, public documentation, suggestion, and audit workflows.
* The API must be usable without a cloud account, external API, embeddings, or hosted service.

### 2.1 Agent Capability Map

V1 parity means agent reachability through MCP or CLI, not identical command lists.
CLI-only capabilities are intentionally not MCP parity gaps; do not add setup, maintenance, recovery, export, inspection, registry management, local viewing, public documentation, suggestion, or audit tools to MCP just to mirror CLI commands.
When a supported MCP or CLI entrypoint exists, agents must use that entrypoint instead of editing `.aictx/` files directly.

| Capability | MCP | CLI | Notes |
| --- | --- | --- | --- |
| Load task context | `load_memory` | `aictx load` | Default routine agent path is CLI; MCP equivalent is supported when configured. |
| Search memory | `search_memory` | `aictx search` | Default routine agent path is CLI; MCP equivalent is supported when configured. |
| Save memory patch | `save_memory_patch` | `aictx save` | All writes use structured patches. |
| Show memory diff | `diff_memory` | `aictx diff` | Git-backed; CLI is the default review path. |
| Initialize storage | none | `aictx init`, `aictx setup` | Setup remains CLI-only in v1. |
| Review patch file | none | `aictx patch review` | Patch review remains CLI-only in v1. |
| Validate storage | none | `aictx check` | Maintenance remains CLI-only in v1. |
| Rebuild generated index | none | `aictx rebuild` | Maintenance remains CLI-only in v1. |
| Reset local storage | none | `aictx reset` | Destructive maintenance remains CLI-only in v1. |
| Upgrade storage schema | none | `aictx upgrade` | Migration remains CLI-only for storage v3. |
| Show memory history | none | `aictx history` | Recovery/inspection remains CLI-only in v1. |
| Restore memory | none | `aictx restore` | Recovery remains CLI-only in v1. |
| Rewind memory | none | `aictx rewind` | Recovery remains CLI-only in v1. |
| Inspect object | none | `aictx inspect` | Debug inspection remains CLI-only in v1. |
| List stale memory | none | `aictx stale` | Debug inspection remains CLI-only in v1. |
| Show graph neighborhood | none | `aictx graph` | Debug inspection remains CLI-only in v1. |
| Export Obsidian projection | none | `aictx export obsidian` | Generated projection remains CLI-only in v1. |
| Manage project registry | none | `aictx projects` | Registry management remains CLI-only in v1. |
| View local memory | none | `aictx view` | Local read-only viewer remains CLI-only in v1. |
| Read public docs | none | `aictx docs` | Bundled public docs remain CLI-only in v1. |
| Suggest memory review packet | none | `aictx suggest` | Agent assistance remains CLI-only in v1. |
| Audit memory hygiene | none | `aictx audit` | Deterministic hygiene review remains CLI-only in v1. |

## 3. Runtime Preconditions

All commands and MCP tools must resolve the project root before doing work.

V1 assumes CLI commands are being run inside an existing project directory. MCP tools may either use the MCP server process current working directory for backward compatibility or an explicit `project_root` input for globally launched MCP servers. Aictx does not create or own a separate Git repository. When Git is available, `.aictx/` is stored inside the enclosing project Git worktree. When Git is unavailable, `.aictx/` is stored under the resolved local project root.

Project root resolution:

* Start from the current working directory, or from MCP `project_root` when a tool call provides it.
* If inside a Git worktree, use the enclosing Git worktree root as `project_root`.
* If not inside a Git worktree and the command is `init`, use the starting directory as `project_root`.
* If not inside a Git worktree and the command is not `init`, walk upward from the starting directory to find the nearest `.aictx/config.json`; its parent directory is `project_root`.
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
aictx init [--no-agent-guidance] [--force] [--json]
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
* If Git is available and tracked `.aictx/` files are dirty while storage is missing or invalid, fail with `AICtxDirtyMemory` unless `--force` is provided.
* If `--force` is provided, remove existing `.aictx/` contents except the active lock file, then create fresh starter storage.
* If Git is available, add or recommend `.gitignore` entries for `.aictx/index/`, `.aictx/context/`, `.aictx/exports/`, and `.aictx/.lock`.
* Create or update marked Aictx guidance sections in `AGENTS.md` and `CLAUDE.md` unless `--no-agent-guidance` is provided.
* Do not start the MCP server; users must configure their MCP client to launch `aictx-mcp`.
* Do not install user-global skills or edit client-specific config such as `~/.codex`, `~/.claude`, `.codex/config.toml`, or `.claude/skills/`.
* Build the initial local index if possible.
* Do not create a Git commit.

If `.aictx/` already exists:

* If valid, return success with a warning unless `--force` is provided.
* If valid and `--force` is provided, reset `.aictx/` and initialize fresh starter storage.
* If invalid, return `AICtxAlreadyInitializedInvalid` unless tracked `.aictx/` files are dirty.
* If invalid and tracked `.aictx/` files are dirty, return `AICtxDirtyMemory` unless `--force` is provided.

Success data:

```json
{
  "created": true,
  "files_created": [
    "AGENTS.md",
    "CLAUDE.md",
    ".aictx/config.json",
    ".aictx/events.jsonl"
  ],
  "gitignore_updated": true,
  "git_available": true,
  "index_built": true,
  "agent_guidance": {
    "enabled": true,
    "targets": [
      {
        "path": "AGENTS.md",
        "status": "created"
      },
      {
        "path": "CLAUDE.md",
        "status": "created"
      }
    ],
    "optional_skills": [
      "integrations/codex/aictx/SKILL.md",
      "integrations/claude/aictx/SKILL.md"
    ]
  },
  "next_steps": [
    "Agents are now instructed through `AGENTS.md` and `CLAUDE.md` to load and save Aictx memory.",
    "`aictx init` creates linked starter placeholders only. To seed useful first-run memory, run `aictx setup` for a review summary or `aictx setup --apply` to apply the conservative bootstrap patch. For manual review, run `aictx suggest --bootstrap --patch > bootstrap-memory.json`, `aictx patch review bootstrap-memory.json`, `aictx save --file bootstrap-memory.json`, and `aictx check`.",
    "`aictx init` does not start MCP; agents should use `aictx load`, `aictx save --stdin`, and `aictx diff` by default. Configure agent clients that support MCP to launch `aictx-mcp` only when you want MCP equivalents such as `load_memory` and `save_memory_patch`. A globally launched MCP server can serve this project when tool calls include this project root as `project_root`.",
    "Review memory changes in `.aictx/`; in Git projects, use `aictx diff` before committing because it includes untracked Aictx memory files that plain `git diff -- .aictx/` can omit.",
    "Optional bundled skills are available under `integrations/codex/` and `integrations/claude/`."
  ]
}
```

### 5.1.1 `aictx setup`

Purpose:

Run the guided first-run onboarding workflow.

Syntax:

```bash
aictx setup [--force] [--apply] [--view] [--open] [--json]
```

Behavior:

* Run `aictx init`, using `--force` only when explicitly requested.
* Build a conservative bootstrap patch proposal.
* Without `--apply`, print a concise review summary and the next command.
* With `--apply`, save the bootstrap patch directly, then run `aictx check`.
* If no bootstrap patch is proposed, print “No bootstrap memory patch to apply” and still run `aictx check`.
* Include a diff summary when Git is available.

### 5.2 `aictx load`

Purpose:

Compile task-specific memory into a context pack.

Syntax:

```bash
aictx load "<task>" [--mode <mode>] [--token-budget <number>] [--file <path>] [--changed-file <path>] [--symbol <name>] [--subsystem <name>] [--history-window <duration>] [--json]
```

Behavior:

* Require initialized `.aictx/`.
* Load only local canonical files and generated local index data.
* Rebuild or refresh the index first if config allows and the index is missing/stale.
* Return a Markdown context pack by default.
* Include Git provenance in the context pack when Git is available.
* If Git is unavailable, include local project provenance and mark Git provenance as unavailable.
* Exclude stale, superseded, and conflicted memory from `Must know` by default.
* Retrieve and render relevant atomic memories, source records, and syntheses; syntheses should help answer broad product, architecture, roadmap, convention, and guidance questions quickly while source records preserve provenance.
* Use `--mode` to tune deterministic ranking and rendering.
* Use repeated `--file`, `--changed-file`, `--symbol`, and `--subsystem` flags as deterministic retrieval hints.
* Use `--history-window` with a compact value such as `30d`, `12w`, `6m`, or `1y` to bound linked Git history for hinted files.
* Treat `--token-budget` as an advisory target only when explicitly provided.
* Keep token target/status metadata out of the Markdown context pack and expose it in JSON output.
* Allowed modes are `coding`, `debugging`, `review`, `architecture`, and `onboarding`; default is `coding`.

JSON success data:

```json
{
  "task": "Fix Stripe webhook retries",
  "mode": "debugging",
  "token_budget": 6000,
  "context_pack": "# AI Context Pack\n...",
  "token_target": 6000,
  "estimated_tokens": 842,
  "budget_status": "within_target",
  "truncated": false,
  "source": {
    "project": "project.billing-api",
    "git_available": true,
    "branch": "main",
    "commit": "abc123"
  },
  "included_ids": ["decision.billing-retries"],
  "excluded_ids": ["decision.old-webhook-retries"],
  "omitted_ids": []
}
```

When no token budget is requested, `token_target` is `null`, `budget_status` is `not_requested`, and no budget-driven omission or compression is applied. `excluded_ids` are retrieval/status/scope/conflict exclusions; `omitted_ids` are selected memory IDs left out of rendered Markdown due to explicit token-target packaging.

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
* Repair or quarantine unrelated malformed memory where possible before applying independent patch changes.
* When Git is available, dirty `.aictx/` files must not block saves by themselves.
* Before overwriting or deleting dirty touched canonical files, copy their previous contents to `.aictx/recovery/` and report the recovery paths.
* Valid dirty `events.jsonl` is allowed because saves append to it; invalid `events.jsonl` is backed up and reduced to valid preserved events where possible before appending.
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
  "recovery_files": [],
  "repairs_applied": [],
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
* Shows tracked and untracked Aictx memory changes under `.aictx/`; plain `git diff -- .aictx/` can omit untracked files before staging.
* Must not show non-Aictx repository changes.
* Must work when `.aictx/` has uncommitted changes.

JSON success data:

```json
{
  "diff": "diff --git ...",
  "changed_files": [".aictx/events.jsonl"],
  "untracked_files": [],
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

Optional v1 commands may be implemented as CLI adapters over shared application services:

```bash
aictx search "<query>" [--limit <number>] [--file <path>] [--changed-file <path>] [--symbol <name>] [--subsystem <name>] [--history-window <duration>] [--json]
aictx stale [--json]
aictx inspect <id> [--json]
aictx graph <id> [--json]
aictx export obsidian [--out <dir>] [--json]
aictx projects (list | add [path] | remove <identifier> | prune) [--json]
aictx view [--port <number>] [--open] [--detach] [--json]
aictx docs [topic] [--open] [--json]
aictx suggest (--from-diff | --bootstrap | --after-task "<task>") [--patch] [--json]
aictx upgrade [--json]
aictx patch review <file> [--json]
aictx setup [--force] [--apply] [--view] [--open] [--json]
aictx audit [--json]
aictx reset [--destroy] [--json]
```

Most optional commands must not mutate canonical storage. `aictx export obsidian` and the explicit viewer Obsidian export action may write generated projection files only. `aictx reset` is the explicit destructive maintenance exception.

Minimum behavior:

* `aictx search` is the CLI equivalent of `search_memory`.
* `aictx stale` lists stale and superseded memory objects.
* `aictx inspect <id>` shows one memory object plus direct relations.
* `aictx graph <id>` shows relation neighborhoods for debugging only.
* `aictx export obsidian` writes a one-way generated Obsidian projection from canonical memory.
* `aictx projects` manages the user-level project registry used by the multi-project viewer.
* `aictx view` starts a loopback-only read-only web viewer for human memory inspection.
* `aictx docs` lists bundled public documentation topics, prints bundled Markdown for a selected topic, and optionally opens the hosted docs page.
* `aictx suggest --from-diff` returns a Git-backed deterministic memory review packet for the current diff and does not write memory.
* `aictx suggest --bootstrap` returns a deterministic first-run memory review packet and does not write memory.
* `aictx suggest --after-task "<task>"` returns an end-of-task save/no-save review packet and does not write memory.
* `aictx suggest --bootstrap --patch` returns a proposed structured memory patch and does not write canonical memory.
* `aictx patch review <file>` validates and summarizes a patch file without writing canonical memory.
* `aictx setup` orchestrates init, bootstrap proposal, optional save, check, and diff summary.
* `aictx audit` returns deterministic memory hygiene findings and does not write memory.
* `aictx upgrade` migrates legacy storage and bundled schemas to storage v3 without inventing evidence.
* `aictx reset` defaults to archiving `.aictx/` under `.aictx/.backup/` before clearing the remaining `.aictx/` contents; `--destroy` deletes `.aictx/` without backup.

Source-package version maintenance is intentionally not an `aictx` CLI command. Use the repository npm script `npm run version:patch`, which runs `npm version patch --no-git-tag-version`, pins the README setup prompt install command to the new package version, and regenerates `src/generated/version.ts`.

### 5.11 `aictx suggest`

Purpose:

Create deterministic evidence packets that help an agent decide whether to save, update, stale, supersede, delete, or skip memory.

Syntax:

```bash
aictx suggest --from-diff [--json]
aictx suggest --bootstrap [--json]
aictx suggest --bootstrap --patch [--json]
aictx suggest --after-task "<task>" [--json]
```

Behavior:

* Require exactly one of `--from-diff`, `--bootstrap`, or `--after-task`.
* `--from-diff` requires Git and returns `AICtxGitRequired` outside a Git worktree.
* `--from-diff` reads the current non-generated project diff and related Aictx memory but does not create memory patches.
* `--bootstrap` works with or without Git and lists likely files for the agent to inspect before creating seed memory.
* `--after-task` packages changed files, related memory, duplicate or stale candidates, recommended facets, and a save/no-save checklist for the completed task.
* `--patch` is valid only with `--bootstrap`; it emits a conservative proposed patch suitable for review and `aictx save --file`.
* `--bootstrap --patch` updates init-created project and architecture placeholders when deterministic evidence is strong, creates source records for important repo files and guidance, creates maintained syntheses for product intent, feature map, and agent guidance when evidence supports them, creates small workflow or constraint memories from package metadata when useful, proposes provenance relations such as `derived_from`, `summarizes`, and `documents`, proposes the starter project-to-architecture relation when it is missing, and emits no patch only when there is no deterministic source, synthesis, workflow, constraint, or starter relation to create.
* All suggestion modes must be deterministic, local-only, and read-only for canonical memory.
* Do not expose an MCP tool for suggestion packets in v1.

JSON success data:

```json
{
  "mode": "from_diff",
  "changed_files": ["src/billing/webhook.ts"],
  "related_memory_ids": ["constraint.webhook-idempotency"],
  "possible_stale_ids": ["decision.old-webhook-retries"],
  "recommended_memory": ["source", "synthesis", "decision", "constraint", "gotcha"],
  "agent_checklist": [
    "Create memory only for durable future value.",
    "Prefer updating or marking stale existing memory over creating duplicates."
  ]
}
```

Bootstrap patch JSON success data with `--json`:

```json
{
  "proposed": true,
  "patch": {
    "source": {
      "kind": "cli",
      "task": "Proposed bootstrap memory patch from deterministic repository analysis"
    },
    "changes": [
      {
        "op": "update_object",
        "id": "architecture.current",
        "body": "# Current Architecture\n\n- Primary source files are under `src/`.\n- The codebase uses TypeScript.\n"
      }
    ]
  },
  "packet": {
    "mode": "bootstrap",
    "changed_files": ["README.md", "package.json"],
    "related_memory_ids": [],
    "possible_stale_ids": [],
    "recommended_memory": ["source", "synthesis", "project", "architecture", "workflow"],
    "agent_checklist": []
  },
  "reason": null
}
```

Without `--json`, `--bootstrap --patch` prints the patch object directly so it
can be redirected to a file and reviewed before `aictx save --file`.

### 5.12 `aictx audit`

Purpose:

Report deterministic memory hygiene findings.

Syntax:

```bash
aictx audit [--json]
```

Behavior:

* Require initialized `.aictx/`.
* Read canonical memory and generated index data where useful.
* Must not mutate canonical memory, generated indexes, events, or exports.
* Report local deterministic findings only; do not call a model or infer semantic truth from code.
* Do not expose an MCP tool for audit in v1.

JSON success data:

```json
{
  "findings": [
    {
      "severity": "warning",
      "rule": "referenced_file_missing",
      "memory_id": "gotcha.webhook-duplicates",
      "message": "Memory references a file that does not exist.",
      "evidence": [{ "kind": "file", "id": "src/old-webhook.ts" }]
    }
  ]
}
```

### 5.13 `aictx export obsidian`

Purpose:

Generate an Obsidian-compatible Markdown projection from canonical Aictx memory.

Syntax:

```bash
aictx export obsidian [--out <dir>] [--json]
```

Behavior:

* Default output is `.aictx/exports/obsidian/`.
* `--out <dir>` is resolved inside the project root only.
* Refuse unsafe targets: project root itself, canonical `.aictx` directories, non-empty directories without an Aictx export manifest, invalid manifests, symlinks, or paths outside the project root.
* Write one generated Obsidian note per memory object at `memory/<object-id>.md`.
* Use JSON frontmatter inside `---` delimiters with flat keys only: `aictx_id`, `aictx_title`, `aictx_type`, `aictx_status`, `aictx_scope_kind`, `aictx_scope_project`, optional branch/task keys, `aictx_created_at`, `aictx_updated_at`, `tags`, `aliases`, and active outgoing relation properties named `aictx_rel_<predicate>`.
* Preserve the canonical Markdown body after frontmatter.
* Append a generated `Aictx Relations` section for active outgoing relations.
* Generate a root index note and `.aictx-obsidian-export.json` manifest.
* On re-export, remove only stale files listed in the previous manifest; never delete unmanifested user files.
* Do not append events, update hashes, rebuild SQLite, or read generated projection files as source data.
* Do not require Obsidian, network access, an Obsidian plugin, or an MCP tool.

Success data:

```json
{
  "format": "obsidian",
  "output_dir": ".aictx/exports/obsidian",
  "manifest_path": ".aictx/exports/obsidian/.aictx-obsidian-export.json",
  "objects_exported": 8,
  "relations_linked": 12,
  "files_written": [],
  "files_removed": []
}
```

### 5.14 `aictx projects`

Purpose:

Manage the user-level project registry used by the multi-project viewer.

Syntax:

```bash
aictx projects list [--json]
aictx projects add [path] [--json]
aictx projects remove <registry-id|project-id|path> [--json]
aictx projects prune [--json]
```

Behavior:

* Store registry state at `$AICTX_HOME/projects.json`, defaulting to `~/.aictx/projects.json`.
* Store only project metadata and roots: registry id, local project id/name, project root, Aictx root, source, registration time, and last-seen time.
* Derive `registry_id` from the canonical project root path hash, not from `project.id`.
* Keep canonical memory isolated in each selected project's `.aictx/` directory.
* Successful project-scoped CLI commands may upsert the current project automatically.
* `remove` must reject ambiguous `project-id` matches.
* `prune` removes entries whose `.aictx/config.json` or canonical storage is no longer available.
* Registry writes must be serialized with a registry lock and written atomically.
* Do not expose MCP project-registry tools in v1.

### 5.15 `aictx view`

Purpose:

Start a local read-only web viewer for browsing canonical Aictx memory.

Syntax:

```bash
aictx view [--port <number>] [--open] [--detach] [--json]
```

Behavior:

* Do not require initialized `.aictx/` in the launch cwd.
* Bind only to loopback.
* Use an available random port by default.
* If `--port <number>` is provided, bind only that port and fail if it is unavailable.
* Print the viewer URL to stdout.
* Include a per-run token in the launched URL and require it for all viewer API requests.
* Serve bundled Svelte/Vite static assets from the package.
* Keep running until interrupted.
* With `--detach`, start a background viewer process, verify it reports a URL, print the URL and log path, then exit.
* `--open` may launch the user's default browser after the server starts.
* Do not mutate canonical memory while starting or serving the viewer.
* Read the user-level project registry to populate the Projects dashboard.
* Include the current project as a dashboard entry when the launch cwd resolves to initialized storage, even if it is not yet persisted in the registry.
* Do not expose an MCP tool for local viewing.
* Follow `local-viewer-spec.md` for the local API, UI behavior, security boundary, and packaging details.

Success data:

```json
{
  "url": "http://127.0.0.1:49152/?token=<redacted>",
  "host": "127.0.0.1",
  "port": 49152,
  "token_required": true,
  "open_attempted": false,
  "registry_path": "/Users/user/.aictx/projects.json",
  "projects_count": 3,
  "initial_project_registry_id": "prj_0123456789abcdef"
}
```

### 5.16 `aictx docs`

Purpose:

Read package-shipped public Aictx documentation from the CLI or open the hosted documentation site.

Syntax:

```bash
aictx docs [topic] [--open] [--json]
```

Behavior:

* Do not require initialized `.aictx/` in the launch cwd.
* With no topic, list available public documentation topics.
* With `<topic>`, print the bundled Markdown for that topic with Starlight frontmatter omitted.
* Support aliases such as `quickstart`, `agents`, `help`, and `patch` for common topic names.
* `--open` opens `https://docs.aictx.dev` or the selected topic URL in the user's default browser.
* Browser-open failures must be warnings, not command failures.
* The command must not read canonical memory, mutate `.aictx/`, or depend on a network request to print bundled docs.

Success data when listing topics:

```json
{
  "kind": "list",
  "base_url": "https://docs.aictx.dev/",
  "topics": [
    {
      "topic": "getting-started",
      "title": "Getting started",
      "description": "Install Aictx, initialize memory, and run the first load/save/diff loop.",
      "url": "https://docs.aictx.dev/getting-started/",
      "aliases": ["quickstart", "install", "start"]
    }
  ],
  "open_attempted": false,
  "opened_url": null
}
```

Success data when printing one topic:

```json
{
  "kind": "topic",
  "topic": "getting-started",
  "title": "Getting started",
  "description": "Install Aictx, initialize memory, and run the first load/save/diff loop.",
  "url": "https://docs.aictx.dev/getting-started/",
  "aliases": ["quickstart", "install", "start"],
  "content": "# Getting started\n\n...",
  "open_attempted": false,
  "opened_url": null
}
```

## 6. MCP Tools

V1 MCP must expose only these required tools:

* `load_memory`
* `search_memory`
* `save_memory_patch`
* `diff_memory`

The MCP server must not expose arbitrary shell access, arbitrary filesystem writes, or low-level graph mutation tools.
Do not add MCP tools for load-mode management, suggestion packets, audits, setup, maintenance, recovery, export, inspection, registry management, local viewing, or public documentation. `aictx suggest`, `aictx audit`, and `aictx docs` remain CLI-only read-only support surfaces in v1.

### 6.1 `load_memory`

Input:

```json
{
  "task": "Fix Stripe webhook retries",
  "token_budget": 6000,
  "mode": "coding",
  "hints": {
    "files": ["src/context/rank.ts"],
    "changed_files": ["src/index/search.ts"],
    "symbols": ["rankMemoryCandidates"],
    "subsystems": ["retrieval"],
    "history_window": "30d"
  },
  "project_root": "/repo"
}
```

Input fields:

* `task` is required.
* `token_budget` is optional. If omitted, no token target is applied.
* `mode` is optional and defaults to `coding`.
* Allowed modes are `coding`, `debugging`, `review`, `architecture`, and `onboarding`.
* `hints` is optional and supports `files`, `changed_files`, `symbols`, `subsystems`, and `history_window`.
* Hint arrays must contain strings only. `history_window` must use a compact value such as `30d`, `12w`, `6m`, or `1y`.
* `project_root` is optional. If omitted, the MCP server launch directory is used.

Behavior:

* Same core behavior as `aictx load`.
* Must keep each target project's memory isolated to its own `.aictx/` directory.
* Must return Markdown context pack plus structured references.
* Must use the same deterministic mode-aware ranking and rendering as CLI `aictx load --mode`.
* May include generated `Architecture Snapshot`, `Rationale Gaps`, and `Linked History` sections when relevant.
* Must preserve high-priority task memory even when an explicit token budget target is exceeded.

Output data:

```json
{
  "context_pack": "# AI Context Pack\n...",
  "token_target": 6000,
  "estimated_tokens": 842,
  "budget_status": "within_target",
  "truncated": false,
  "source": {
    "branch": "main",
    "commit": "abc123"
  },
  "included_ids": ["decision.billing-retries"],
  "excluded_ids": ["decision.old-webhook-retries"],
  "omitted_ids": []
}
```

`budget_status` is one of `not_requested`, `within_target`, or `over_target`.

### 6.2 `search_memory`

Input:

```json
{
  "query": "Stripe webhook idempotency",
  "limit": 10,
  "hints": {
    "files": ["src/context/rank.ts"],
    "changed_files": ["src/index/search.ts"],
    "subsystems": ["retrieval"],
    "history_window": "30d"
  },
  "project_root": "/repo"
}
```

Input fields:

* `query` is required.
* `limit` is optional and defaults to `10`.
* `hints` is optional and has the same shape as `load_memory.hints`.
* `project_root` is optional. If omitted, the MCP server launch directory is used.

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
  "project_root": "/repo",
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
* Must write only to the selected project's isolated `.aictx/` directory.
* Must not infer semantic memory from code diffs.
* Must not commit.
* Must not reject writes only because `.aictx/` files are dirty.
* Must quarantine or repair unrelated malformed memory where possible.
* Must back up dirty touched files to `.aictx/recovery/` before overwrite/delete and report recovery paths.

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
{
  "project_root": "/repo"
}
```

Input fields:

* `project_root` is optional. If omitted, the MCP server launch directory is used.

Behavior:

* Require Git; outside a Git worktree return `AICtxGitRequired`.
* Same core behavior as `aictx diff --json`.
* Must not mutate canonical storage.

Output data:

```json
{
  "diff": "diff --git ...",
  "changed_files": [".aictx/events.jsonl"],
  "untracked_files": [],
  "changed_memory_ids": [],
  "changed_relation_ids": []
}
```

## 7. Structured Patch Format

The structured patch is the only write contract.

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
  "tags": ["billing", "stripe"],
  "facets": {
    "category": "decision-rationale",
    "applies_to": ["src/workers/billing-retries.ts"],
    "load_modes": ["coding", "debugging"]
  },
  "evidence": [{ "kind": "file", "id": "src/workers/billing-retries.ts" }]
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
* `facets`
* `evidence`
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
  "tags": ["billing", "stripe", "queue"],
  "facets": {
    "category": "decision-rationale",
    "applies_to": ["src/workers/billing-retries.ts"]
  },
  "evidence": [{ "kind": "file", "id": "src/workers/billing-retries.ts" }]
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
* `facets`
* `evidence`
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
* `save_memory_patch` must try to repair or quarantine unrelated malformed memory and keep applying independent patch changes.
* When Git is available, `save_memory_patch` must not reject writes only because `.aictx/` is dirty.
* When Git is available, `save_memory_patch` must back up dirty touched files to `.aictx/recovery/` before overwrite/delete.
* When Git is available, `diff_memory` must show only `.aictx/` changes, including untracked Aictx memory files.
* When Git is available, `restore` and `rewind` must refuse to run when `.aictx/` is dirty.
* No command or MCP tool may run `git commit`.

Dirty file detection:

* A file is dirty if Git reports it modified, added, deleted, renamed, or unmerged under `.aictx/`.
* Generated and local ignored files under `.aictx/index/`, `.aictx/context/`, `.aictx/exports/`, `.aictx/recovery/`, and `.aictx/.lock` do not count as dirty.

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
* `AICtxExportTargetInvalid`
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
* In Git projects, `aictx diff` and `diff_memory` show only `.aictx/` changes, including untracked Aictx memory files.
* `aictx export obsidian` writes generated Obsidian files without mutating canonical memory.
* `aictx check` reports storage validation errors without mutating canonical files.
* Outside Git, Git-only commands return `AICtxGitRequired`.
* In Git projects, `aictx restore <commit>` restores only `.aictx/`.
* In Git projects, `aictx rewind` restores the previous committed `.aictx/` state.
* MCP exposes no arbitrary shell or filesystem write tool.
* No API path requires embeddings, network access, or a cloud account.
