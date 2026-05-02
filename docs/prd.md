Aictx Product Requirements Document

Executive intent

Aictx exists to solve one specific problem:

AI coding agents lose or misuse project context across tasks, branches, tools, and sessions.

Aictx gives those agents a simple load/save memory interface stored as local files and enhanced by Git when available.

The application should help a developer or team answer two questions quickly:

Before work: What does the AI agent need to know for this task?
After work: What should future AI agents remember from this work?

The intent of the app is not to create a general knowledge-management system. The intent is to make AI-assisted software development more reliable by storing durable project memory as readable, reviewable local files, with Git-backed reversibility when Git is available.

The desired user reaction is:

“This is where my AI agent loads project context from, and where it saves durable project memory as reviewable local files.”

Working name

Aictx

The name is provisional. The product category is more important than the name:

Local-first project memory for AI coding agents.

Alternative category descriptions:

* Version-controlled memory for AI coding agents
* Git-aware AI project memory
* Local-first context layer for AI-heavy developers and teams
* A memory compiler for AI-assisted software development

⸻

1. Product summary

Aictx is a local-first, Git-aware memory layer for developers and software teams using AI coding agents.

It lets AI agents load relevant project context before work and save durable project knowledge after work. The memory is stored in human-readable Markdown plus machine-readable JSON sidecars, can be reviewed and committed with Git when available, and is compiled into a local SQLite index for fast retrieval.

The product should not try to replace the user’s AI agent. Instead, it gives existing agents a reliable memory substrate.

User's AI agent / coding assistant
        ↓
Aictx MCP / CLI tools
        ↓
Markdown + JSON memory files
        ↓
SQLite generated index
        ↓
Optional Git history, diff, review, rollback

The core promise:

Stop re-explaining your codebase to AI agents. Aictx gives them durable project memory stored as readable local files, with Git review and rollback when available.

1.1 V1 scope

V1 should be intentionally narrow and useful for individual developers first.

Required in v1:

* .aictx/ project memory directory
* Markdown memory bodies
* JSON sidecars for structured memory metadata
* JSON relation files
* events.jsonl as local semantic memory history
* JSON Schema validation
* Local generated SQLite index with FTS
* CLI commands for init, load, save, diff, check, rebuild, history, restore, and rewind
* MCP server with a small normalized tool set
* Default repo-level agent guidance plus optional generated skill artifacts from one shared template
* Memory discipline guidance for short linked memories, lifecycle updates, and save/no-save decisions
* Patch-first memory writes
* Git-backed review, diff, history, and restore behavior when Git is available
* Basic secret detection before saving memory
* Mode-aware context loading for coding, debugging, review, architecture, and onboarding work
* CLI-only deterministic memory suggestion and audit packets for agent-assisted memory maintenance
* One-way generated Obsidian projection export for viewing memory in Obsidian
* Local read-only web viewer for human memory inspection

Agent capability split:

* MCP + CLI capabilities: load, search, save, diff.
* CLI-only capabilities in v1: init, check, rebuild, history, restore, rewind, inspect, stale, graph, export obsidian, view, suggest, audit.
* CLI-only capabilities are intentionally not MCP parity gaps and should not be added to MCP solely for command-list parity.
* Agents should use supported MCP or CLI entrypoints instead of editing `.aictx/` files directly when a supported command exists.

Deferred from v1:

* Cross-project, workspace, or global memory
* Embeddings
* Hosted sync
* Team governance workflows
* PR bots or GitHub/GitLab apps
* Cloud MCP endpoint
* Full-project visual graph database
* Enterprise policy engine

Extension points may be reserved for embeddings, cross-project/workspace/global scopes, and hosted team workflows, but they must not complicate the v1 local-first developer experience.

Git availability clarification:

* Aictx is installed as a tool and then initialized inside an existing project directory.
* `.aictx/` lives inside that project directory, alongside the user's source code.
* Aictx does not create or own a separate Git repository.
* Git is optional for core memory operations in v1.
* When the project is inside a Git worktree, Aictx uses Git for review, diff, dirty-state detection, history, and restore.
* When the project is not inside a Git worktree, Aictx still supports init, load, save, search, check, rebuild, and MCP load/search/save flows.
* Git-only features such as history, restore, rewind, and Git diff return a clear Git-required error outside Git.

⸻

2. Core positioning

Aictx is not:

* An Obsidian clone
* An Obsidian-native database or two-way Obsidian sync layer
* An Obsidian plugin
* A generic note-taking app
* A visual graph database
* A hosted memory API first
* A vector database product
* An AI chat UI
* A replacement for documentation
* A replacement for the user’s LLM

Aictx is:

* A local project-memory layer for AI coding agents
* A local source of truth for architecture decisions, constraints, facts, open questions, project concepts, and product features
* A context compiler that gives agents compact relevant context for a task
* A deterministic persistence layer for agent-generated memory updates
* Transparent memory files that developers can diff, edit, commit, and revert when Git is available

The product should feel like:

load context → do work → save memory → review Git diff

Not like:

design ontology → maintain graph DB → manage knowledge base → configure AI pipeline

⸻

3. Target users

3.1 Primary target: AI-heavy individual developers

These users are already using tools such as Cursor, Claude Code, ChatGPT, local coding agents, or IDE-integrated assistants.

They experience repeated friction:

* The agent forgets architecture decisions.
* The agent misses project constraints.
* The agent repeats past mistakes.
* The agent does not know why certain code exists.
* The agent cannot distinguish current from stale assumptions.
* Context must be manually re-explained in each new task/session.

Individual developers are the likely first adopters, especially for an open-source version.

3.2 Secondary target: software teams using AI agents

Teams experience the same problem, but with additional concerns:

* Shared memory across developers and agents
* Reviewable memory updates
* GitHub/GitLab workflows
* Auditability
* Rollback
* Policy and permission controls
* Stale or hallucinated project knowledge becoming persistent
* Cross-repo/project memory

Teams are likely the long-term monetization path.

⸻

4. Product principles

4.1 Simple to use

The product must be immediately understandable.

A developer should understand the basic usage in less than a minute:

aictx init
aictx load "fix Stripe webhook retries"
aictx save --stdin
review .aictx/ changes

In Git projects, review with:

aictx diff

In the CLI flow, `aictx save --stdin` expects a structured memory patch. In the preferred agent flow, the AI coding agent calls `save_memory_patch` directly through MCP.

The first user-facing mental model:

Before work: load project memory.
After work: save what changed.
Everything is visible in Git.

4.2 Minimal interaction overhead

Aictx must not require many round trips between the agent and the tool.

Ideal agent interaction:

1 read call: load task context
1 write call: save memory patch

The product should avoid chatty APIs that require the LLM to repeatedly call low-level tools such as read_node, read_relation, validate_relation, create_fact, etc.

4.3 The user’s agent does the semantic reasoning

Aictx should not attempt to be the smart AI.

The user’s LLM/coding agent is responsible for semantic reasoning:

* Understanding the task
* Reading diffs
* Summarizing what changed
* Drafting memory updates
* Identifying decisions, constraints, open questions, stale assumptions

Aictx is responsible for deterministic memory operations:

* Providing current context
* Receiving structured memory patches
* Writing files consistently
* Validating basic structure
* Updating the local index
* Showing diffs
* Supporting rollback

4.4 Local files first, Git as the safety layer when available

Aictx should not overbuild approval workflows in the first version.

The initial safety model:

* Memory is stored as files.
* Changes are visible as readable Markdown and JSON file changes.
* In Git projects, changes appear in git diff.
* Users can edit memory manually.
* In Git projects, users can commit memory changes.
* In Git projects, users can revert or restore memory from Git history.

The guiding principle:

Make good memory easy, make bad memory reversible.

Not:

Prevent every bad memory from being written.

4.5 Human-readable, machine-structured

Markdown should serve humans and LLMs.

JSON should serve structure, validation, indexing, and deterministic writes.

SQLite should serve speed.

Git should serve history, review, and rollback when available.

4.6 No YAML in the core

YAML should be avoided in the core design.

Reasons:

* Ambiguous parsing edge cases
* Indentation fragility
* Parser differences
* Weak fit for strict machine contracts
* Easy for LLMs to produce subtly invalid output

Aictx should use:

Markdown = prose
JSON = structured metadata and patches
JSONL = append-only event log
SQLite = generated local index
JSON Schema = validation
Git = optional history/review/rollback

4.7 Fast and reliable by default

The default flow should feel local and immediate.

V1 should optimize for:

* No required configuration after `aictx init`.
* No network calls in init, load, search, save, diff, check, rebuild, history, restore, or MCP tools.
* Warm load and search operations that feel interactive on ordinary developer machines.
* Generated indexes that can always be deleted and rebuilt.
* Clear, actionable errors when validation, repair, recovery backup, or index rebuilds fail.

4.8 Memory discipline, not just storage

Aictx should shape good agent memory behavior instead of merely accepting entries.

The memory lifecycle rules are:

* Load narrowly before architecture, debugging, review, onboarding, dependency, configuration, or non-trivial code work.
* Use the task description and load mode to retrieve the smallest useful context pack.
* Save only durable knowledge: decisions, constraints, architecture changes, gotchas, workflows, debugging outcomes, verified facts, concepts, product features, and open questions.
* Prefer updating, marking stale, or superseding existing memory over creating duplicates.
* Mark memory stale or superseded when current code, tests, manifests, or user instruction contradict it.
* Prefer current code, tests, manifests, and the user's request over loaded memory when they conflict.
* Review memory diffs at the end of meaningful work so the user can approve, edit, or revert changes.
* Save nothing when no durable future value was discovered.

Aictx may produce deterministic review packets that help an agent decide what to save, but Aictx must not pretend to semantically understand a diff without the user's agent. The agent remains responsible for drafting structured memory patches.

⸻

5. Core user experience

5.1 First-time setup

Commands:

```bash
aictx init
aictx setup
aictx setup --apply
```

Expected behavior:

* Detects whether the current directory is inside a Git worktree.
* If Git is available, initializes `.aictx/` at the Git worktree root.
* If Git is unavailable, initializes `.aictx/` in the current directory.
* Initializes default memory files.
* Creates default JSON schemas.
* Creates config file.
* Builds initial SQLite index.
* Prints concise next steps for CLI and MCP usage.
* `aictx setup` orchestrates init, bootstrap suggestion, check, diff summary, and optional bootstrap save.
* `aictx setup --apply` applies the conservative bootstrap patch without requiring users to shuttle a temporary JSON file by hand.

Expected generated structure:

.aictx/
  config.json
  memory/
    project.md
    project.json
    architecture.md
    architecture.json
    decisions/
    constraints/
    questions/
    gotchas/
    workflows/
    notes/
  relations/
  events.jsonl
  schema/
    config.schema.json
    object.schema.json
    relation.schema.json
    event.schema.json
    patch.schema.json
  index/
    aictx.sqlite

The user should not be asked to design an ontology during onboarding.

Optional project detection may identify:

* Single app
* Monorepo
* Library/package
* SaaS product
* Agency/client project

But this should be optional and lightweight.

5.2 Load memory before a task

Command:

aictx load "fix Stripe webhook retries"
aictx load "fix Stripe webhook retries" --mode debugging

MCP equivalent:

load_memory(task, token_budget?, mode?)

Purpose:

* Return a compact, task-specific context pack.
* Prioritize active, relevant, high-signal memory.
* Exclude stale or superseded memory unless useful for context.
* Use an explicit token budget as an advisory target, without hiding high-priority memory.
* Use load mode to tune type priority and rendered sections.

Example output:

# AI Context Pack
Task: Fix Stripe webhook retries
Generated from: main@abc123
## Must know
- Billing webhook handlers must be idempotent.
- Stripe may deliver duplicate events.
- Retry logic belongs in the queue worker, not the HTTP handler.
## Do not do
- Do not retry synchronously inside the HTTP webhook handler.
- Do not double-charge when Stripe sends duplicate events.
## Relevant decisions
- Billing retries moved to queue worker
## Relevant constraints
- Webhook processing must be idempotent
## Relevant files
- services/billing/src/webhooks/handler.ts
- services/worker/src/jobs/process-stripe-event.ts
## Open questions
- Retry backoff policy is not finalized.

5.3 Save memory after work

Command:

aictx save --stdin

MCP equivalent:

save_memory_patch(patch)

Important clarification:

The user’s AI agent performs the semantic reasoning. Aictx should not attempt to fully infer architectural or product meaning using deterministic code.

The agent should inspect relevant materials such as:

* Git diff
* Conversation summary
* Task description
* Changed files
* Current context pack

Then the agent submits a structured memory patch to Aictx.

Aictx then:

* Validates the patch shape.
* Generates IDs and filenames if needed.
* Writes Markdown bodies.
* Writes JSON sidecars.
* Writes relation JSON files.
* Appends semantic events to events.jsonl.
* Rebuilds or incrementally updates the SQLite index.
* Leaves all changes visible in Git.

CLI save semantics

aictx save is patch-first in v1.

Accepted v1 entrypoints:

1. Agent-driven mode: the agent calls the MCP tool save_memory_patch with a structured patch. This is the preferred path.
2. CLI patch mode: aictx save accepts a patch from --file or --stdin and sends it through the same validation/write path.

The client AI agent, not Aictx, is responsible for semantic derivation from git diff, conversation history, task description, changed files, and prior context.

Aictx should not attempt to infer architectural meaning from code diffs in v1. A future helper may package save context for an agent, but the deterministic product contract remains patch → validation → file writes → index update → Git diff.

The internal write path should be the same in both modes:

memory patch → validation → deterministic file writes → index update → Git diff

Aictx should not silently commit changes. It should write files and let the user decide whether to commit, edit, or revert them.

5.3.1 Memory suggestion packets

Command:

aictx suggest --from-diff
aictx suggest --bootstrap

Purpose:

* Package deterministic evidence for the user's agent.
* Help the agent decide whether to create, update, stale, or supersede memory.
* Generate bootstrap patch drafts only when deterministic evidence is strong, and never save them implicitly.

`aictx suggest --from-diff` is Git-required. It should summarize changed files, changed `.aictx/` files, related existing memory, possible stale candidates, and a concise agent checklist. It must not write memory.

`aictx suggest --bootstrap` should work without Git. It should list likely source files to inspect, such as README files, package manifests, framework configs, docs, and obvious entrypoints, and recommend seed memory classes for project intent, architecture, constraints, workflows, gotchas, concepts, product features, and open questions. `aictx suggest --bootstrap --patch` may emit a conservative structured patch for review and `aictx save`, but it must not write memory.

5.3.2 Memory audit packets

Command:

aictx audit

Purpose:

* Report deterministic memory hygiene findings.
* Help agents and users clean memory without requiring a hosted service or model call.

Audit findings should include `severity`, `rule`, `memory_id`, `message`, and `evidence`. V1 audit should focus on local deterministic checks such as vague memory, duplicate-like titles or tags, stale/superseded cleanup, missing referenced files, missing tags, missing evidence where evidence is expected, and obvious manifest/version contradictions.

Audit must not mutate canonical memory. The agent may turn audit findings into a structured patch through `save_memory_patch` or `aictx save`.

5.4 Show memory diff

Command:

aictx diff

Git requirement:

This command is available when the project is inside a Git worktree. Outside Git, users can still inspect `.aictx/` files directly.

Broader than a plain focused Git diff because it also renders untracked Aictx memory files before staging:

git diff -- .aictx/

Should show only Aictx-related changes.

5.5 Rewind/restore memory

This flow is available when the project is inside a Git worktree.

Commands:

aictx history
aictx rewind
aictx restore <commit>

Purpose:

* Make bad memory reversible.
* Allow returning .aictx/ to a previous Git state.
* Avoid requiring complex approval workflows in v1.

Implementation behavior can wrap Git operations such as:

git restore --source <commit> -- .aictx/

or generate reverse patches.

V1 distinction:

* aictx restore <commit> restores .aictx/ from an explicit Git commit.
* aictx rewind is a convenience helper for restoring the previous committed .aictx/ state.

⸻

6. Main commands

6.1 Required CLI commands

aictx init

Initialize project memory.

aictx load "<task>"

Compile task-specific context.

aictx save --file <path>
aictx save --stdin

Save memory update from a structured patch, usually via --file or stdin.

aictx diff

Show memory changes when Git is available.

aictx check

Validate memory structure and index health.

aictx rebuild

Rebuild generated indexes from canonical files.

aictx history

Show Git-backed memory history.

aictx rewind

Restore memory to a previous point.

aictx restore <commit>

Restore .aictx/ from a specific Git commit.

6.2 Optional/advanced CLI commands

aictx search "<query>"

Search memory.

aictx stale

List stale/superseded memory.

aictx inspect <id>

Inspect a memory object and its relations.

aictx graph <id>

Show graph relationships for debugging/advanced use. Graph visualization should not be the main UX.

aictx export obsidian [--out <dir>]

Generate a disposable Obsidian-compatible Markdown projection from canonical Aictx memory. Aictx remains the source of truth; exported files are generated and may be deleted and rebuilt.

aictx view [--port <number>] [--open] [--detach] [--json]

Start a local loopback-only read-only web viewer for browsing canonical Aictx memory, searching objects, inspecting Markdown/JSON, seeing direct relation neighborhoods, and triggering the generated Obsidian projection export.

⸻

7. MCP interface

MCP should be first-class because it allows existing AI clients and coding agents to interact with Aictx.

The MCP interface should be intentionally small but powerful enough to disappear into normal agent workflows.

Design principle:

* A small normalized tool set is better than many low-level tools.
* Agents should not need to orchestrate file writes, relation writes, index updates, or shell commands.
* All memory writes should go through structured patch submission.
* MCP should make Aictx easy to insert into existing coding-agent flows without becoming a spaghetti API.
* MCP exposes load, search, save, and diff; the CLI also exposes those routine capabilities.
* Setup, maintenance, recovery, export, inspection, local viewing, suggestion, and audit capabilities remain CLI-only in v1: init, check, rebuild, history, restore, rewind, inspect, stale, graph, export obsidian, view, suggest, and audit.
* MCP-first must not mean MCP-only: AI agents may use the CLI for supported setup, maintenance, recovery, export, inspection, local viewing, suggestion, and audit operations that are intentionally outside the MCP contract.
* Every supported Aictx capability should remain reachable to an AI agent through MCP or CLI without requiring direct `.aictx/` file edits.
* CLI-only capabilities should not be added to MCP just to create command-list parity.

7.1 Required MCP tools

load_memory

Input:

{
  "task": "Fix Stripe webhook retries",
  "token_budget": 6000,
  "mode": "coding"
}

Allowed modes are `coding`, `debugging`, `review`, `architecture`, and `onboarding`.

In v1, MCP scope is resolved from the local Aictx project where the MCP server is running. `scope.kind` defaults to `project`, `scope.project` defaults to `config.project.id`, and branch/commit provenance is included only when Git is available. Scope is not supplied as an arbitrary client payload field.

Output:

* Markdown context pack
* Optional structured references
* Source project metadata and optional commit SHA
* Included memory object IDs
* Structured token metadata when a token budget is explicitly requested
* Excluded stale object IDs, if relevant

search_memory

Input:

{
  "query": "Stripe webhook idempotency",
  "limit": 10
}

Output:

* Matching memory objects
* Snippets
* Status
* Paths
* IDs

save_memory_patch

Input:

A structured patch generated by the user’s agent.

The agent may derive this patch from git diff, conversation history, task description, changed files, and the current context pack. Aictx validates and writes the patch; it does not perform semantic derivation itself in v1.

Output:

* Files changed
* Object IDs created/updated
* Relations created/updated
* Events appended
* Validation warnings/errors
* Index update result

diff_memory

Input:

{}

Output:

* Git diff for .aictx/
* Changed memory objects
* Changed relations

7.2 Avoid low-level MCP tools in v1

Avoid exposing many low-level tools such as:

* create_node
* create_relation
* update_fact
* read_relation
* validate_relation
* write_file
* delete_file
* run_shell_command

The product should not require an LLM to orchestrate many tiny operations.

7.3 MCP safety boundary

The MCP server should not expose arbitrary filesystem or shell access.

The LLM should submit structured memory patches. Aictx should write files deterministically.

7.4 MCP adapter validation dependency

The MCP adapter may use Zod as a direct runtime dependency for transport-level tool input shape validation.

This dependency is allowed because the MCP TypeScript SDK's high-level tool registration path is designed around Zod-compatible schemas, and declaring it directly is clearer than relying on a transitive or peer-installed copy.

Zod should remain an adapter-boundary tool only:

* Validate MCP input shape, required fields, primitive types, and optional field presence.
* Do not duplicate product validation owned by shared application services.
* Do not move patch semantics, token-budget rules, project resolution, Git behavior, conflict checks, secret detection, or storage validation into MCP-only schemas.
* Do not expand the normalized MCP tool set.
* Do not introduce network access, hosted services, embeddings, or cloud dependencies.

⸻

8. Storage architecture

8.1 Chosen stack

Canonical data:

Markdown = prose/body
JSON = structured object metadata
JSON = relation records
JSONL = append-only semantic event log

Generated data:

SQLite = local compiled index
SQLite FTS = local full-text search
Context packs = optional generated/debug artifacts

Embeddings are deferred from v1. The design may reserve future extension points, but v1 must work with local files and SQLite FTS only.

Validation:

JSON Schema

History/review:

Git

8.2 Directory structure

Recommended v1 structure:

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
    notes/
      stripe-webhook-behavior.md
      stripe-webhook-behavior.json
  relations/
    decision-billing-retries-requires-constraint-webhook-idempotency.json
    billing-retries-affects-billing.json
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
    # optional generated context packs

Recommended .gitignore when Git is available:

.aictx/index/
.aictx/context/
.aictx/.lock

Commit:

.aictx/config.json
.aictx/memory/
.aictx/relations/
.aictx/events.jsonl
.aictx/schema/

Do not track generated indexes by default when Git is available.

8.3 Canonical ownership rules

Aictx uses multiple file types, but each file type owns a different kind of data. There should be no duplicate canonical ownership.

Markdown owns:

* Long-form body
* Human-readable explanation
* Narrative context
* Consequences
* Notes

JSON sidecars own:

* ID
* Type
* Status
* Title
* Created/updated timestamps
* Content hash
* Scope
* Optional tags
* Optional source metadata

Relation JSON files own:

* Typed links between memory objects
* Relation predicate
* Relation status
* Optional confidence
* Optional evidence references

Events JSONL owns:

* Semantic history of memory operations
* Created/updated/staled/superseded memory events
* Actor/source metadata

SQLite owns:

* Nothing canonical
* It is always rebuildable

If Markdown and JSON disagree, the JSON sidecar wins for structure and metadata. Markdown wins for prose content. aictx check should report inconsistencies; Aictx should not silently guess which value is correct.

Example:

JSON title mismatch with Markdown H1 → warning
Missing Markdown body for JSON sidecar → error
Relation points to missing object ID → error
Hash mismatch after manual edit → warning or fixable error

8.4 Why not YAML

YAML is intentionally excluded from the core.

Reasons:

* Avoid parser ambiguity
* Avoid indentation fragility
* Avoid duplicated metadata in frontmatter
* Keep machine contracts as strict JSON
* Keep Markdown files pure and readable

8.5 Why not SQLite as canonical storage

SQLite is excellent for local indexing and querying but should not be canonical because:

* Git diffs are poor.
* Manual review is harder.
* Manual editing is harder.
* It weakens the local-first/no-lock-in story.
* It hides memory from LLMs and humans.

SQLite should be generated from Markdown + JSON.

8.6 Why not Markdown only

Markdown-only storage is too loose for:

* Typed relations
* Reliable indexing
* Validation
* Stable IDs
* Structured patches
* Fast context compilation
* Staleness tracking
* Future team governance

Markdown should be the prose layer, not the entire database.

⸻

9. Memory object model

9.1 Public object types

Keep object types small in v1.

Required types:

project
architecture
decision
constraint
question
fact
gotcha
workflow
note
concept

Definitions:

project

High-level project memory.

architecture

Current system architecture overview.

decision

Durable architecture/product/implementation decision.

constraint

A rule future agents should respect.

question

An unresolved question or ambiguity.

fact

A known project fact.

gotcha

A known failure mode, trap, recurring bug, or behavior that future agents should avoid.

workflow

A repeated project procedure, command sequence, release path, debugging path, or maintenance routine.

note

General memory entry that does not fit another type.

concept

Named project/domain concept used for linking and retrieval.

Only these ten values are object types in v1. Do not add `history` or `task-note`
as object types: use Git/events/statuses for history and use branch/task scope
for temporary task context.

9.2 Object status values

General memory statuses:

active
draft
stale
superseded
rejected

Question-specific statuses:

open
closed

Suggested usage:

* active: current and usable
* draft: proposed or incomplete
* stale: no longer reliable
* superseded: replaced by another object
* rejected: intentionally not accepted
* open: unresolved question, primarily for question objects
* closed: resolved question, primarily for question objects

V1 should avoid mixing lifecycle meanings. Non-question objects should normally use active, draft, stale, superseded, or rejected.

9.3 Object JSON sidecar schema example

Example file:

.aictx/memory/decisions/billing-retries.json

Example content:

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
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "created_at": "2026-04-25T14:00:00+02:00",
  "updated_at": "2026-04-25T14:00:00+02:00"
}

9.4 Markdown body example

Example file:

.aictx/memory/decisions/billing-retries.md

Example content:

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

Markdown should contain no YAML frontmatter.

9.5 Title consistency

The JSON sidecar owns the canonical title.

The Markdown H1 should generally match the JSON title.

If they diverge, aictx check should warn:

Title mismatch:
- JSON title: Billing retries moved to queue worker
- Markdown H1: Billing retry architecture

A future aictx fix command may normalize this.

⸻

10. Relations

10.1 Relation purpose

Relations give memory graph behavior without requiring users to think in graph database terms.

Relations should help answer:

* What decisions affect this service?
* What constraints apply to this task?
* What memory supersedes old memory?
* What concepts are related?
* What files or features are impacted?

10.2 Required relation predicates

Initial controlled predicate set:

affects
requires
depends_on
supersedes
conflicts_with
mentions
implements
related_to

Predicates must be directional, controlled, and minimally overlapping. V1 should avoid near-duplicates because agents will otherwise use them inconsistently.

Definitions:

affects

Source object affects target object.

requires

Source object requires target constraint/concept/fact.

depends_on

Source object depends on target object.

supersedes

Source object supersedes target object, usually because the target is outdated.

conflicts_with

Source object conflicts with target object.

mentions

Source object mentions target concept/entity.

implements

Source object implements target decision/constraint/concept.

related_to

Generic fallback relation. Should be allowed but not overused.

10.3 Relation JSON example

Example file:

.aictx/relations/decision-billing-retries-requires-constraint-webhook-idempotency.json

Example content:

{
  "id": "rel.decision-billing-retries-requires-constraint-webhook-idempotency",
  "from": "decision.billing-retries",
  "predicate": "requires",
  "to": "constraint.webhook-idempotency",
  "status": "active",
  "confidence": "high",
  "created_at": "2026-04-25T14:00:00+02:00",
  "updated_at": "2026-04-25T14:00:00+02:00"
}

10.4 Relation validation

aictx check should validate:

* Relation file is valid JSON.
* Relation matches JSON Schema.
* from object exists.
* to object exists.
* Predicate is allowed.
* Relation ID is unique.
* No duplicate equivalent relation exists.

⸻

11. Event log

11.1 Purpose

events.jsonl is an append-only semantic history.

Git already provides file history, but events provide structured history useful for:

* Timeline views
* Audit UI
* Rewind UX
* Analytics
* Debugging
* Team governance later

11.2 Event examples

{"event":"memory.created","id":"decision.billing-retries","actor":"agent","timestamp":"2026-04-25T14:00:00+02:00"}
{"event":"relation.created","relation_id":"rel.decision-billing-retries-requires-constraint-webhook-idempotency","actor":"agent","timestamp":"2026-04-25T14:01:00+02:00"}
{"event":"memory.marked_stale","id":"decision.sync-webhook-retries","actor":"agent","reason":"Superseded by queue-worker retry decision","timestamp":"2026-04-25T14:02:00+02:00"}

11.3 Event types

Recommended initial event types:

memory.created
memory.updated
memory.marked_stale
memory.superseded
memory.rejected
memory.deleted
relation.created
relation.updated
relation.deleted
index.rebuilt
context.generated

Physical deletion should be rare. Prefer stale/superseded statuses.

⸻

12. Patch format

12.1 Purpose

The patch format is the write contract between the agent and Aictx.

The agent should not write arbitrary .aictx/ files directly.

Instead:

Agent proposes semantic patch → Aictx writes deterministic files → Git shows diff

12.2 Patch example

{
  "source": {
    "kind": "agent",
    "task": "Fix Stripe webhook retries",
    "commit": "abc123"
  },
  "changes": [
    {
      "op": "create_object",
      "type": "decision",
      "title": "Billing retries moved to queue worker",
      "body": "Stripe webhook retries now happen in the queue worker instead of the HTTP handler.\n\n## Consequences\n\n- Processing must be idempotent.\n- Queue retry policy affects billing reliability.",
      "tags": ["billing", "stripe", "webhooks"]
    },
    {
      "op": "create_object",
      "type": "constraint",
      "title": "Webhook processing must be idempotent",
      "body": "Stripe may deliver duplicate events, so processing must tolerate duplicate event IDs.",
      "tags": ["billing", "stripe"]
    },
    {
      "op": "create_relation",
      "from": "decision.billing-retries",
      "predicate": "requires",
      "to": "constraint.webhook-idempotency"
    },
    {
      "op": "mark_stale",
      "id": "decision.sync-webhook-retries",
      "reason": "Retries no longer happen synchronously in the HTTP handler."
    }
  ]
}

12.3 Required patch operations

create_object
update_object
mark_stale
supersede_object
create_relation
update_relation
delete_relation

Physical object deletion should be supported carefully but discouraged.

12.4 Patch processing responsibilities

Aictx should:

* Validate the patch JSON.
* Generate stable IDs when omitted.
* Generate safe filenames.
* Detect collisions.
* Write Markdown body files.
* Write JSON sidecar files.
* Write relation files.
* Append semantic events.
* Update content hashes.
* Update/rebuild local index.
* Return a summary of changed files.

⸻

13. ID and filename strategy

13.1 Stable IDs

Every memory object and relation must have a stable ID.

IDs must not depend on file paths.

Example IDs:

project.billing-api
architecture.current
decision.billing-retries
constraint.webhook-idempotency
question.retry-backoff
note.stripe-webhook-behavior
rel.decision-billing-retries-requires-constraint-webhook-idempotency

13.2 ID generation

When an agent patch omits an ID, Aictx should generate one using:

<type>.<slugified-title>

If collision occurs:

<type>.<slugified-title>-2

or a short stable suffix.

13.3 Filename generation

Markdown and JSON sidecars should share basename:

billing-retries.md
billing-retries.json

Relation files:

decision-billing-retries-requires-constraint-webhook-idempotency.json

Filenames are not canonical. IDs are canonical.

⸻

14. Content hashing

14.1 Purpose

Every memory object should store a content hash.

Content hashing enables:

* Incremental indexing
* Cache invalidation
* Detecting unchanged memory
* Reproducible context packs
* Debugging stale index issues
* Detecting manual edits
* Efficient sync later

14.2 Hash strategy

Each object JSON sidecar should include:

{
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
}

The hash should be computed from a canonical representation of:

* Object JSON metadata excluding volatile fields and the hash itself
* Markdown body content
* Optionally related relation IDs, if desired

Recommended v1 behavior:

object_content_hash = sha256(canonical_json(object_without_hash) + "\n" + markdown_body)

Relation JSON files should also include a hash or be hashable by the indexer.

14.3 Hash validation

aictx check should detect:

* Hash missing
* Hash mismatch
* Body file changed without index update

A future aictx fix can refresh hashes.

⸻

15. Local index

15.1 Purpose

SQLite is a generated local index used for speed.

It should support:

* Fast lookup by ID
* Full-text search
* Graph traversal
* Status filtering
* Scope filtering
* Context compilation
* Incremental updates

15.2 Generated index location

.aictx/index/aictx.sqlite

This directory should be gitignored by default when Git is available.

15.3 Rebuildability

The index must always be rebuildable from canonical files:

aictx rebuild

If the index is deleted or corrupted, no memory is lost.

15.4 Suggested SQLite tables

objects(
  id text primary key,
  type text not null,
  status text not null,
  title text not null,
  body_path text not null,
  body text,
  content_hash text,
  scope_json text,
  tags_json text,
  created_at text,
  updated_at text
);
relations(
  id text primary key,
  from_id text not null,
  predicate text not null,
  to_id text not null,
  status text not null,
  confidence text,
  created_at text,
  updated_at text
);
events(
  id integer primary key autoincrement,
  event text not null,
  memory_id text,
  relation_id text,
  actor text,
  timestamp text,
  payload_json text
);
objects_fts(
  id,
  title,
  body
);

Optional future table:

embeddings(
  id text primary key,
  vector blob,
  model text,
  content_hash text,
  created_at text
);

The embeddings table is a future extension point, not a v1 requirement.

15.5 Incremental indexing

The indexer should use content hashes to avoid reprocessing unchanged files.

Index update triggers:

* Save memory patch
* Manual file change detected
* Explicit rebuild command

⸻

16. Retrieval and context compilation

16.1 Context compiler purpose

The context compiler is one of the core product features.

It transforms broad project memory into a compact, task-specific context pack for an AI agent.

The user/agent asks:

What does the agent need to know to do this task well?

Aictx answers with a ranked context pack.

16.2 Retrieval strategy

Retrieval should be hybrid:

1. Exact ID/path matches
2. Full-text search
3. Graph traversal
4. Recent relevant memory
5. Status/scope filtering
6. Precision-first token target packaging

Embeddings are not included in v1.

SQLite FTS should be enough for the initial version. Aictx must not require an external embedding API, subscription, or network configuration to produce useful context packs.

16.3 Ranking priorities

Prefer:

active > stale/superseded
constraints > generic notes
relevant decisions > generic architecture
open questions > unrelated facts
recent project memory > old low-signal notes
highly connected objects > isolated objects
objects related to changed files/task terms > generic matches

16.4 Token target awareness

load_memory should accept an optional token budget.

Example:

{
  "task": "Fix Stripe webhook retries",
  "token_budget": 6000
}

If `token_budget` is omitted, Aictx should not apply a token target and should not truncate or compress content for budget reasons.

If `token_budget` is provided, the compiler should treat it as an advisory target. Aictx should compact or omit lower-priority presentation details first, but must preserve high-priority task memory such as `Must know` and `Do not do` even when the final pack exceeds the target. Budget status belongs in structured CLI/MCP metadata, not in the Markdown context pack sent to the client LLM.

16.5 Context pack sections

Recommended context pack structure:

# AI Context Pack
Task: <task>
Generated from: <local project id and optional git ref>
## Must know
## Do not do
## Relevant decisions
## Relevant constraints
## Relevant gotchas
## Relevant workflows
## Relevant facts
## Relevant files
## Open questions
## Stale or superseded memory to avoid

16.6 Optional saved context packs

Aictx may optionally write generated context packs to:

.aictx/context/

This directory should be gitignored by default when Git is available.

Saved context packs are useful for debugging:

What did the agent know when it made this change?

⸻

17. Git integration

17.1 Git as optional first-class integration

Aictx does not require a Git worktree for core v1 memory operations.

Git is the primary review/history/rollback layer when available.

Memory changes should be normal file changes.

Developers in Git repositories should be able to use:

git diff .aictx/
git add .aictx/
git commit -m "Update AI project memory"
git restore .aictx/

Aictx should provide convenience wrappers, but not hide Git.

Aictx must not commit automatically. When Git is available, it writes memory files and leaves review, staging, committing, and pushing under user control.

17.2 Required Git-aware features

Aictx should know these when Git is available:

* Current commit SHA
* Current branch
* Whether .aictx/ has uncommitted changes
* Whether .aictx/ contains merge conflicts
* Memory diff
* Memory history
* Restore target

17.3 Context pack provenance

Context packs should include source commit when Git is available:

Generated from: main@abc123

This helps reproduce or debug agent behavior.

When Git is unavailable, context packs should include local project provenance and mark Git provenance as unavailable.

17.4 Rewind behavior

aictx rewind should restore .aictx/ to a previous Git-backed state when Git is available.

Possible modes:

* Restore to previous memory commit
* Restore to specific Git commit
* Restore only selected memory object

Outside Git, rewind should return a clear Git-required error.

17.5 Dirty and conflicted memory behavior

When Git is available and .aictx/ has uncommitted changes, Aictx should not overwrite memory silently.

Recommended v1 behavior:

* load_memory may proceed and should include Git provenance when available.
* save_memory_patch should not block only because memory files are dirty; it should back up dirty touched files before overwrite/delete and report the recovery paths.
* diff_memory should show only .aictx/ changes, including untracked Aictx memory files.
* restore should require an explicit target and should not affect non-Aictx files.

If `.aictx/` contains malformed or conflicted memory unrelated to an incoming save, Aictx should quarantine or repair what it can and keep applying independent new memory. `aictx check` should still report remaining invalid storage.

When Git is available and Git reports unresolved conflicts inside .aictx/, Aictx should also block save and rebuild operations until conflicts are resolved.

17.6 events.jsonl merge risk

events.jsonl is local semantic history. When tracked in Git, it is append-only and can conflict under concurrent branch work.

V1 should treat events.jsonl conflicts as normal Git conflicts. Aictx check should detect invalid JSONL or conflict markers and report a clear error.

⸻

18. Validation and checks

18.1 Keep validation lightweight in v1

Avoid heavy governance initially.

Required checks:

* Valid JSON files
* JSON Schema compliance
* Unique object IDs
* Unique relation IDs
* Object body files exist
* Relation endpoints exist
* Allowed relation predicates
* Valid status values
* Content hash consistency
* SQLite index can rebuild
* No obvious secrets in saved memory

18.2 Secret detection

Aictx should include basic secret detection before saving memory.

Block or warn on obvious patterns such as:

* Private keys
* API keys
* Tokens
* Password-like values
* .env secrets

This should be simple in v1, not full enterprise DLP.

18.3 Avoid excessive safeguards initially

Do not require approval workflows, complex contradiction detection, or strict evidence rules in the first developer-focused version.

The guiding principle:

Git provides rollback when available.
Aictx provides structure.
Users keep control.

18.4 Memory poisoning and prompt-injection risk

Because memory is loaded into AI agents, saved memory can become an attack surface.

V1 should include basic safeguards:

* Treat memory as project data, not trusted instructions from an external authority.
* Prefer context pack sections that distinguish facts, constraints, decisions, and stale memory.
* Detect obvious secret material before saving.
* Make every memory write visible as local file changes and, in Git projects, visible in Git diff.
* Avoid loading stale, superseded, rejected, or conflicted memory into Must know sections by default.

Aictx should not attempt full automated truth verification in v1. The safety model is structured memory, local files, and Git review/reversible history when available.

⸻

19. Staleness and supersession

19.1 Stale memory is first-class

Do not delete old memory by default.

Prefer:

active → stale
active → superseded

This is useful because old project knowledge often explains why current decisions exist.

19.2 Stale object example

{
  "id": "decision.sync-webhook-retries",
  "type": "decision",
  "status": "superseded",
  "title": "Retry webhooks synchronously",
  "body_path": "memory/decisions/sync-webhook-retries.md",
  "superseded_by": "decision.billing-retries",
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "created_at": "2026-03-10T09:00:00+02:00",
  "updated_at": "2026-04-25T14:00:00+02:00"
}

19.3 Supersession relation

{
  "id": "rel.billing-retries-supersedes-sync-retries",
  "from": "decision.billing-retries",
  "predicate": "supersedes",
  "to": "decision.sync-webhook-retries",
  "status": "active"
}

19.4 Context compiler behavior

By default, stale/superseded memory should be excluded from Must know sections.

It may appear in a section like:

## Stale or superseded memory to avoid
- Do not assume webhook retries happen synchronously; this was superseded by the queue-worker retry decision.

⸻

20. Scoping

20.1 Purpose

Memory should support scopes to avoid pollution.

V1 scope kinds:

project
branch
task

Reserved future scopes:

global
workspace
cross_project

20.2 Scope example

{
  "scope": {
    "kind": "branch",
    "project": "project.billing-api",
    "branch": "feature/webhook-retries",
    "task": null
  }
}

20.3 Context compiler behavior

When loading memory, Aictx should prioritize:

1. Current project memory
2. Matching branch/task memory
3. Related stale/superseded memory only if useful

Project scope should be the default. Branch scope should be explicit and used only for branch-specific facts or decisions. Task scope should be explicit and used only for temporary or task-specific context that should not pollute the general project memory.

Git worktree behavior:

* Project identity comes from `.aictx/config.json`, not from the physical path of a Git worktree checkout.
* Multiple Git worktrees for the same repository should therefore share the same project scope when `.aictx/config.json` is the same.
* Once written, `project.id` is stable and should not be regenerated just because the project directory or worktree path changes.
* Branch scope is matched by branch name only and should be used sparingly.
* Detached HEAD has no current branch scope match.
* The default save scope must not become branch-scoped merely because the current project is inside Git.

Global, workspace, and cross-project memory are deferred from v1. The storage model may leave room for them, but the initial product should not require cross-project indexing or global memory configuration. Future global scope should be added through an explicit project registry and trust boundary rather than by treating local `project.id` values as globally unique.

⸻

21. Agent guidance and instruction files

21.1 Purpose

Aictx should integrate with existing AI coding workflows rather than forcing a new workflow.

V1 should install concise repo-level agent instruction files by default.

Reasoning:

* The desired first-run experience is that agents can start using Aictx memory without the human reminding them to load or save context.
* `AGENTS.md` and `CLAUDE.md` are transparent, reviewable repo files and can carry short cross-agent instructions without user-global configuration.
* Tool-specific skills are still optional because installing them can require client-specific configuration or user-global state.

`aictx init` should create or update marked Aictx sections in `AGENTS.md` and `CLAUDE.md` by default. Users can opt out with `aictx init --no-agent-guidance`.

V1 should also ship optional, copyable agent guidance and skill artifacts that users can adopt or edit.

Required v1 guidance source and generated artifacts:

* `docs/agent-integration.md`
* `integrations/templates/agent-guidance.md`
* `integrations/codex/aictx/SKILL.md`
* `integrations/claude/aictx/SKILL.md`
* `integrations/claude/aictx.md`
* `integrations/generic/aictx-agent-instructions.md`

The template is the canonical guidance source. Agent-specific guidance files should be generated from the template during the npm build, so Codex, Claude, and generic instructions do not drift.

Generated guidance is a guidance layer. It must not be treated as canonical memory, and Aictx must work without it.

Default init must not install user-global skills, edit `~/.codex`, edit `~/.claude`, or modify client-specific project config such as `.codex/config.toml` or `.claude/skills/`.

21.2 Example agent instructions

# AI project memory
Before non-trivial coding tasks, call:
`aictx load "<task>"`
After completing a task that changes architecture, behavior, dependencies, constraints, or important project knowledge, call:
`save_memory_patch` through MCP, or `aictx save --stdin` with a structured patch.
Do not edit `.aictx/` files directly unless explicitly instructed. Prefer submitting a structured memory patch through Aictx.
Memory changes are stored as local files. If the project uses Git, the user can inspect them with:
`aictx diff`

⸻

22. Config

22.1 Config file

Use JSON:

.aictx/config.json

Example:

{
  "version": 1,
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

`defaultTokenBudget` is retained for compatibility and future user preference work. In v1, omitting `token_budget` from `load_memory` must not silently apply this value as a truncation target.

22.2 Config principles

* Keep config minimal.
* Defaults should work without user customization.
* Avoid forcing users to configure schemas or policies early.
* project.id should default to `project.<slugified-project-root-basename>`.
* project.id is the default `scope.project` label.
* git settings apply only when Git is available.

22.3 Storage versioning and migrations

config.json should include the storage format version.

V1 behavior:

* If the version is missing, aictx check should report an error and suggest re-initialization or migration.
* If the version is newer than the installed CLI supports, Aictx should refuse writes and explain the version mismatch.
* If the version is older than the installed CLI supports, Aictx should refuse writes until a future migration path is available.
* Read-only commands may still inspect memory when safe.

Future versions may add an explicit migration command, but v1 should not silently rewrite storage formats.

⸻

23. Open-source and paid boundaries

23.1 Likely open-source core

The open-source developer-focused version should include:

* File format
* CLI
* Local compiler
* Local SQLite index
* JSON schemas
* MCP server
* Load memory
* Save memory patch
* Diff/history/restore helpers
* Basic validation
* Basic secret detection

Reason:

The trust story depends on openness:

local-first
Git-aware
plain files
no lock-in
inspectable memory

23.2 Future paid/team layer

Paid features should remove team friction and add governance:

* GitHub/GitLab app
* PR memory suggestions
* Advanced automated memory truth verification
* Hosted team index
* Cloud MCP endpoint
* Review dashboard
* Audit logs
* RBAC/SSO
* Team policy config
* Stale memory reports
* Cross-repo memory graph
* Private deployment
* Advanced secret/PII detection
* Advanced entity resolution

The paid layer should not compromise the local-first core.

⸻

24. Future team workflows

These are important for product direction but should not complicate v1.

24.1 PR memory impact

On a pull request, Aictx could:

* Analyze changed files and diff through the user’s agent or CI integration.
* Suggest memory updates.
* Detect stale memory.
* Comment with proposed memory patch.
* Validate .aictx/ changes in CI.

Example PR comment:

Memory impact detected:
+ Add decision: Billing retries moved to queue worker
+ Add constraint: Webhook processing must be idempotent
~ Mark stale: Synchronous webhook retries
Suggested memory patch available.

24.2 Team review

Teams may eventually want:

* Required review for decisions/constraints
* Auto-accept for open questions and low-risk notes
* Audit trail
* Ownership
* Policy enforcement

Do not force this into the initial individual developer UX.

⸻

25. Important product decisions

Decision 1: Existing agents provide intelligence

Aictx does not compete with the user’s LLM.

It provides memory infrastructure.

Decision 2: Git is the approval and rollback layer when available

Do not overbuild review workflows initially.

Decision 3: No YAML

Use Markdown + JSON + JSONL + SQLite.

Decision 4: Markdown and JSON are both canonical, but own different things

Markdown owns prose.

JSON owns metadata and structure.

There should be no duplicate ownership.

Decision 5: SQLite is generated

SQLite must always be rebuildable.

Decision 6: MCP interface must be small

Prefer:

load_memory
search_memory
save_memory_patch
diff_memory

Avoid exposing too many granular tools.

The agent capability model is MCP-first, CLI-complete. Routine memory work should happen through MCP when available. Commands that are user-facing, diagnostic, or recovery-oriented can remain CLI-only as long as agents are explicitly allowed to run them and receive stable `--json` output where automation benefits from it.

The MCP adapter may declare Zod directly and use it for tool input shape validation, but service-level validation must remain shared with the CLI so MCP behavior does not fork from CLI behavior.

Decision 7: UX must avoid graph/ontology language

User-facing language:

memory
context
decision
constraint
question
fact
stale
load
save
diff
rewind

Avoid leading with:

nodes
edges
triples
ontology
semantic graph
vector store

Decision 8: Context packs are the main consumed artifact

The value is not just storing memory.

The value is compiling the right memory for the current task.

Decision 9: Memory writes should be patch-based

Agents submit structured patches.

Aictx writes files deterministically.

Decision 10: Start with lightweight validation

Avoid making the initial product feel like enterprise compliance software.

Decision 11: Memory discipline is policy plus deterministic packets

Aictx should guide agents toward short, linked, reviewable memory and provide deterministic suggestion/audit packets. It should not call a model, infer semantic truth from code, or auto-save memory from diffs in v1.

⸻

26. Non-goals for initial product

Do not prioritize:

* Full-project visual graph UI
* Obsidian plugin
* Two-way Obsidian sync or importing Obsidian edits back into Aictx
* Custom Markdown editor
* Hosted cloud-first architecture
* Complex ontology builder
* Heavy approval workflows
* Full enterprise policy engine
* Production-grade DLP
* Neo4j or external graph database dependency
* Vector database dependency
* AI chat interface
* Automatic deterministic architecture understanding

These may become future features only if they support the core workflow.

⸻

27. Success criteria

The product is working if:

* A developer can initialize it quickly inside a normal project directory, with or without Git.
* The agent can load useful project context in one tool call.
* The agent can save memory in one tool call by submitting a structured patch.
* aictx load works using only local files and SQLite FTS.
* The product works without a cloud account, external API, or embedding subscription.
* The resulting memory changes are understandable as local Markdown and JSON file changes.
* In Git projects, memory changes are understandable in git diff.
* In Git projects, a bad memory update can be reverted with Git-backed restore.
* Memory remains human-readable.
* events.jsonl is stored as semantic memory history.
* The local index is always rebuildable from canonical files.
* The context pack improves agent performance without requiring the user to manage an ontology.
* A new developer can understand the product intent from the first command and generated files.
* The product remains useful with only two agent interactions per task: one memory load and one memory save.
* Agents can use mode-aware load, suggestion packets, and audit findings to keep memory narrow, current, and reviewable.

⸻

28. Core mental model

The product should be explainable as:

Aictx gives AI coding agents a load/save memory API backed by local files and enhanced by Git when available.

Expanded:

Before a task, the agent loads relevant project memory.
After a task, the agent saves what changed.
Aictx stores memory as Markdown plus JSON, indexes it locally, and keeps everything reviewable as local files. In Git projects, it also makes memory changes reversible through Git.

⸻

29. Spec boundaries for development

After this PRD is validated, the next implementation specs should divide responsibility as follows:

storage-format-spec.md should define:

* Exact .aictx/ file layout
* JSON schemas
* Markdown/JSON ownership rules
* Storage versioning
* Event log format
* Validation rules

mcp-and-cli-api-spec.md should define:

* CLI command syntax and outputs
* MCP tool inputs and outputs
* Patch I/O contract
* Error behavior
* Git availability and dirty-state behavior

indexing-and-context-compiler-spec.md should define:

* SQLite schema
* FTS indexing
* Rebuild and incremental update behavior
* Ranking rules
* Precision-first token target handling
* Context pack format

30. Final architecture summary

User / AI coding agent
        ↓
CLI or MCP
        ↓
load_memory / save_memory_patch
        ↓
Aictx compiler
        ↓
Canonical storage:
  - Markdown bodies
  - JSON sidecars
  - JSON relation files
  - JSONL event log
        ↓
Generated storage:
  - SQLite index
  - FTS search
  - future embedding extension point
        ↓
Git:
  - diff
  - commit
  - history
  - rewind

One-sentence product definition:

Aictx is a local-first memory layer that lets AI coding agents load relevant project context and save durable project knowledge as readable, reviewable files.
