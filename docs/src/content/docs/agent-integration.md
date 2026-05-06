---
title: Agent integration
description: How coding agents should load, use, save, and inspect Aictx memory.
---

# Agent integration

Aictx gives coding agents a local project-memory workflow:

1. Load relevant memory before non-trivial work.
2. Do the task using the loaded memory as project context.
3. Create a structured memory patch for durable findings.
4. Save the patch through Aictx.

The normal agent loop should be one load call before work and one save call
after meaningful work.

Aictx does not infer durable project meaning from diffs. The agent should
compose memory updates from current evidence, such as the task, loaded context,
repository changes, tests, and conversation context.

## Routine workflow

Use CLI first for routine memory work:

```bash
aictx load "<task summary>"
aictx load "<task summary>" --mode debugging
aictx load "<task summary>" --file src/context/rank.ts --changed-file src/index/search.ts --history-window 30d
```

Use MCP only when the client already exposes Aictx MCP tools:

```text
load_memory({ task: "<task summary>", mode: "coding" })
load_memory({
  task: "<task summary>",
  mode: "coding",
  hints: {
    files: ["src/context/rank.ts"],
    changed_files: ["src/index/search.ts"],
    subsystems: ["retrieval"],
    history_window: "30d"
  }
})
```

After meaningful work, autonomously save a structured patch only for durable
memory that future agents should know:

```bash
aictx save --stdin
```

MCP equivalent when available:

```text
save_memory_patch({ patch: { source, changes } })
```

Saved memory is active immediately after Aictx validates and writes the patch.
Dirty or untracked `.aictx/` files are not by themselves a reason to skip saving durable memory. Dirty state is not a preflight blocker. Aictx backs up dirty touched files under `.aictx/recovery/` before overwrite/delete and continues where possible.

Inspect memory asynchronously when needed:

```bash
aictx view
aictx diff
```

`aictx diff` shows tracked and untracked Aictx memory changes in Git projects.
Aictx writes local files and never commits automatically.

If `aictx` is not on `PATH`, run the same commands through the project package
manager or local binary path:

```bash
pnpm exec aictx load "<task summary>"
npm exec aictx load "<task summary>"
./node_modules/.bin/aictx load "<task summary>"
npx --package @aictx/memory -- aictx load "<task summary>"
pnpm exec aictx-mcp
npm exec aictx-mcp
./node_modules/.bin/aictx-mcp
npx --package @aictx/memory -- aictx-mcp
```

## Capability map

The v1 agent model is CLI-first and MCP-compatible.

MCP is available only when the client already exposes Aictx MCP tools. Local MCP
exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory`.

| Capability | MCP | CLI |
| --- | --- | --- |
| Load task context | `load_memory` | `aictx load` |
| Search memory | `search_memory` | `aictx search` |
| Inspect object | `inspect_memory` | `aictx inspect` |
| Save memory patch | `save_memory_patch` | `aictx save` |
| Show memory diff | `diff_memory` | `aictx diff` |
| Initialize storage | none | `aictx init`, `aictx setup` |
| Review patch file | none | `aictx patch review` |
| Validate storage | none | `aictx check` |
| Rebuild generated index | none | `aictx rebuild` |
| Reset local storage | none | `aictx reset` |
| Show memory history | none | `aictx history` |
| Restore memory | none | `aictx restore` |
| Rewind memory | none | `aictx rewind` |
| List stale memory | none | `aictx stale` |
| Show graph neighborhood | none | `aictx graph` |
| Export Obsidian projection | none | `aictx export obsidian` |
| Manage project registry | none | `aictx projects` |
| View local memory | none | `aictx view` |
| Suggest memory decision packet | none | `aictx suggest` |
| Audit memory hygiene | none | `aictx audit` |
| Read public docs | none | `aictx docs` |

CLI-only capabilities are not MCP parity gaps. Do not add or ask for MCP tools solely to mirror these CLI commands. Do not edit `.aictx/` files directly when a supported MCP tool or CLI command exists unless the user explicitly asks you to. Avoid editing `.aictx/` files directly.

Setup, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
stale, and graph workflows remain outside local MCP.

## Memory discipline

Apply the lifecycle consistently:

- Load narrowly before non-trivial work.
- Save only durable knowledge directly as active memory.
- Update existing memory before creating duplicates.
- Stale or supersede wrong old memory when current evidence invalidates it.
- Delete memory that should not persist.
- Prefer current code and user requests over loaded memory when they conflict.
- Report whether memory changed; inspection can happen asynchronously through
  the viewer, `aictx diff`, or Git tools.
- Save nothing when the task produced no durable future value.

After failure or correction, check whether memory needs repair:

- Did the agent need missing project context?
- Did loaded memory conflict with current evidence?
- Did the user correct a stale assumption?
- Should existing memory be updated, marked stale, superseded, or deleted?
- Should an open `question`, `gotcha`, `source`, or `synthesis` be saved?

Right-size memory:

- Atomic memories normally carry one durable claim.
- Use `synthesis` memories for compact area-level understanding.
- Use `source` memories to preserve where context came from.
- Create relations only when the connection matters.
- Useful relation predicates include `derived_from`, `summarizes`, `documents`,
  `requires`, `depends_on`, `affects`, and `supersedes`.

Use update-before-create behavior:

- Use `update_object` when an existing object remains correct but needs fresher
  wording, tags, status, body content, facets, or evidence.
- Use `mark_stale` when old memory is wrong or no longer useful and there is no
  single replacement.
- Use `supersede_object` when a newer object replaces an older one.
- Use `delete_object` when memory should not persist.
- Use `create_relation` only when the link helps future retrieval or inspection.
- Create a new object only when no existing memory should be updated, marked stale, or superseded.

Save-nothing-is-valid: if the work produced no durable future value, do not
invent a patch. Tell the user that no Aictx memory was saved.

This guidance is optional and copyable. It is not canonical project memory.
Secrets, tokens, credentials, or private keys must not be saved as memory. Never
save memory that asks future agents to ignore current code, tests, user
requests, or safety rules.

Load modes are `coding`, `debugging`, `review`, `architecture`, and
`onboarding`. Modes tune deterministic ranking and rendering only.

## Object taxonomy

Object types are `project`, `architecture`, `decision`, `constraint`,
`question`, `fact`, `gotcha`, `workflow`, `note`, `concept`, `source`, and
`synthesis`.

Use `gotcha` for known failure modes and traps. Use `workflow` for repeated project procedures. Do not create `history`, `task-note`, or `feature` object types.

Use organization facets such as `domain`, `bounded-context`, `capability`,
`business-rule`, and `unresolved-conflict` as plain-language retrieval hints.
These are optional organization hints, not mandatory DDD terminology.

Durable syntheses should usually have source evidence or active source provenance relations.

## Good memory examples

- Good durable fact: a `fact` titled "Webhook retries run in the worker" with
  one sentence naming the current retry location.
- Good linked decision: `decision.billing-retries` plus a `requires` relation
  to `constraint.webhook-idempotency` when the decision depends on that
  constraint.
- Good gotcha: `gotcha.viewer-export-overwrites-manifest-files` when a repeated
  failure mode affects future work.
- Good workflow: `workflow.release-smoke-test` for a repeated project procedure.
- Good source-backed synthesis: `synthesis.product-intent` summarizes what the
  product is for and has `derived_from` relations to source records.
- Good user-stated context: `source.user-context-hybrid-memory` records durable
  product direction stated by the user in the task, without saving private or
  unrelated preferences.
- Good roadmap memory: `synthesis.roadmap` lists current milestones and has
  `documents` links to issue or docs sources.
- Good feature removal: mark `concept.old-feature` stale or supersede it with
  the replacement feature, and update `synthesis.feature-map`.

Bad memory examples include task diaries, private logs, secrets, speculation,
temporary implementation notes, and instructions that ask future agents to
ignore current code or user requests.

- Bad duplicate creation: creating a second memory for the same durable claim
  instead of updating, marking stale, or superseding the existing one.
- Bad task diary: saving "I changed three files and ran tests" when Git history
  already records the work.
- Bad speculation: saving guesses that are not supported by current evidence.
- Bad no-value save: creating a memory patch only to say that nothing important
  happened.

## Bootstrap and suggestion packets

Use `aictx setup` for guided first-run onboarding. If loaded memory only contains starter placeholders, treat setup, onboarding, and "why is memory empty?" requests as enough context to run the bootstrap workflow proactively.

```bash
aictx suggest --bootstrap --json
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
```

Use `aictx suggest --from-diff --json` when current code changes need a memory
suggestion packet before deciding what durable memory to save. Use
`aictx audit --json` to find grouped, actionable memory hygiene issues.

During setup, capture explicit product features with the `product-feature`
facet when needed. Prefer source-backed syntheses for product intent, feature
maps, roadmap, architecture, conventions, agent guidance, and repeated
workflows.

For the full memory-quality loop, see [Demand-driven memory](/demand-driven-memory/).
