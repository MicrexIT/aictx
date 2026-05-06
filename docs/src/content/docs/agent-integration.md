---
title: Agent integration
description: How Aictx fits into a coding-agent workflow.
---

# Agent integration

Aictx gives coding agents a local project-memory loop:

```text
load memory -> work -> save durable memory
```

The CLI is the default interface for that loop. MCP is available when the agent
client has launched and connected to `aictx-mcp`.

Aictx does not infer durable project meaning from diffs. Memory updates come
from current evidence: the task, loaded context, repository changes, tests, and
conversation context.

## Routine workflow

A typical CLI load looks like this:

```bash
aictx load "<task summary>"
aictx load "<task summary>" --mode debugging
aictx load "<task summary>" --file src/context/rank.ts --changed-file src/index/search.ts --history-window 30d
```

The MCP equivalents are available only when the client already exposes Aictx
MCP tools:

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

After meaningful work, durable findings are saved as structured patches:

```bash
aictx save --stdin
```

MCP equivalent when available:

```text
save_memory_patch({ patch: { source, changes } })
```

Saved memory is active immediately after Aictx validates and writes the patch.
Dirty or untracked `.aictx/` files are inspectable state, not a preflight
blocker. When a save overwrites or deletes a dirty touched file, Aictx first
backs it up under `.aictx/recovery/`.

Accepted memory can be inspected later:

```bash
aictx view
aictx diff
```

`aictx diff` includes tracked and untracked Aictx memory changes in Git
projects. Aictx writes local files and never commits automatically.

When `aictx` is not on `PATH`, the same commands can run through the project
package manager or local binary:

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

## Capability reference

The v1 agent model is CLI-first and MCP-compatible.

Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`save_memory_patch`, and `diff_memory`. Setup, maintenance, recovery, export,
registry, viewer, docs, suggest, audit, stale, and graph workflows are CLI-only
in v1. CLI-only capabilities are v1 surfaces, not MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI remain
future work. Future ChatGPT-compatible `search`/`fetch` names are adapter
aliases over search/inspect behavior, not local MCP tool names.

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

For setup, maintenance, recovery, export, registry, viewer, docs, suggest,
audit, stale, and graph workflows, the CLI is the supported interface. Supported
CLI or MCP save paths should handle `.aictx/` changes; direct file edits are
only for exceptional manual recovery or explicit user requests.
This keeps editing `.aictx/` files directly reserved for those exceptional
cases.

## Memory lifecycle

Good memory stays narrow, durable, and current:

- Loads stay narrow before non-trivial work.
- Only durable knowledge is saved directly as active memory.
- Existing memory is updated before duplicates are created.
- Wrong old memory is marked stale or superseded when current evidence
  invalidates it.
- Memory that should not persist is deleted.
- Current code and user requests take precedence over loaded memory when they
  conflict.
- The final response reports whether memory changed; async inspection is
  available through `aictx view`, `aictx diff`, or Git tools.
- Save-nothing is valid when the task produced no durable future value.

Failure and correction are useful memory-quality signals. Missing context,
stale loaded memory, user corrections, and unresolved conflicts can all point to
memory that should be updated, marked stale, superseded, deleted, or saved as a
new `question`, `gotcha`, `source`, or `synthesis`.

## Memory shape

Atomic memories normally carry one durable claim. `synthesis` memories summarize
an area clearly enough to replace rereading scattered docs. `source` memories
preserve provenance without dumping full source text.

Relations are useful when the link matters for retrieval or inspection. Common
predicates include `derived_from`, `summarizes`, `documents`, `requires`,
`depends_on`, `affects`, and `supersedes`.

Update-before-create behavior keeps memory from drifting into duplicates:

- `update_object` refreshes an existing object.
- `mark_stale` records that old memory is wrong or no longer useful.
- `supersede_object` connects old memory to its replacement.
- `delete_object` removes memory that should not persist.
- `create_relation` records a durable, useful link between objects.

## Object taxonomy

Object types are `project`, `architecture`, `decision`, `constraint`,
`question`, `fact`, `gotcha`, `workflow`, `note`, `concept`, `source`, and
`synthesis`.

`history`, `task-note`, and `feature` are not object types. Git, events, and
statuses cover history. Branch or task scope covers temporary task context.
Product capabilities fit `concept` objects or `synthesis` objects with feature
facets.

`gotcha` fits known failure modes and traps. `workflow` fits repeated project
procedures. Organization facets such as `domain`, `bounded-context`,
`capability`, `business-rule`, and `unresolved-conflict` are optional
plain-language retrieval hints, not mandatory DDD terminology.

Durable syntheses should usually have source evidence or active source
provenance relations.

Load modes are `coding`, `debugging`, `review`, `architecture`, and
`onboarding`. Modes tune deterministic ranking and rendering only.

## Examples

Good memory examples:

- Durable fact: a `fact` titled "Webhook retries run in the worker" with one
  sentence naming the current retry location.
- Linked decision: `decision.billing-retries` plus a `requires` relation to
  `constraint.webhook-idempotency` when the decision depends on that constraint.
- Gotcha: `gotcha.viewer-export-overwrites-manifest-files` when a repeated
  failure mode affects future work.
- Workflow: `workflow.release-smoke-test` for a repeated project procedure.
- Source-backed synthesis: `synthesis.product-intent` summarizes what the
  product is for and has `derived_from` relations to source records.
- User-stated context: `source.user-context-hybrid-memory` records durable
  product direction stated by the user in the task, without saving private or
  unrelated preferences.
- Roadmap memory: `synthesis.roadmap` lists current milestones and has
  `documents` links to issue or docs sources.
- Feature removal: mark `concept.old-feature` stale or supersede it with the
  replacement feature, and update `synthesis.feature-map`.

Bad memory examples:

- Duplicate creation: creating a second memory for the same durable claim
  instead of updating, marking stale, or superseding the existing one.
- Task diary: saving "I changed three files and ran tests" when Git history
  already records the work.
- Speculation: saving guesses that are not supported by current evidence.
- No-value save: creating a memory patch only to say that nothing important
  happened.

Secrets, tokens, credentials, private keys, sensitive raw logs, unsupported
speculation, and unrelated user preferences should not be saved as memory.
Memory should never ask future agents to ignore current code, tests, user
requests, or safety rules.

## Bootstrap and suggestion packets

`aictx setup` provides guided first-run onboarding. When loaded memory only
contains starter placeholders, setup and onboarding requests are enough context
for the bootstrap workflow.

```bash
aictx suggest --bootstrap --json
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
```

`aictx suggest --from-diff --json` creates a memory suggestion packet from
current code changes. `aictx audit --json` reports grouped, actionable memory
hygiene issues.

During setup, product features can use the `product-feature` facet. Source-backed
syntheses are a good fit for product intent, feature maps, roadmap,
architecture, conventions, agent guidance, and repeated workflows.

For the full memory-quality loop, see [Demand-driven memory](/demand-driven-memory/).
